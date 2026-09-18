import { Router } from 'express';
import { Template } from '../models.js';
import { submitTemplate, fetchTemplateStatuses } from '../services/metaApi.js';
import { assertMetaConfig } from '../config.js';

const router = Router();

router.get('/', async (req, res) => {
  const templates = await Template.find({ business: req.user.business }).sort({ createdAt: -1 }).lean();
  res.json(templates);
});

// Create locally as DRAFT. Nothing reaches Meta until /submit.
router.post('/', async (req, res) => {
  const { name, language, category, bodyText, headerText, footerText } = req.body || {};
  if (!name || !category || !bodyText) {
    return res.status(400).json({ error: 'name, category and bodyText are required' });
  }
  if (!/^[a-z0-9_]+$/.test(name)) {
    return res.status(400).json({ error: 'template name must be lowercase letters, numbers and underscores' });
  }
  try {
    const template = await Template.create({
      business: req.user.business,
      name, language, category, bodyText, headerText, footerText,
    });
    res.status(201).json(template);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'template name already exists for this language' });
    throw err;
  }
});

// Submit a DRAFT (or resubmit a REJECTED) template to Meta for approval.
router.post('/:id/submit', async (req, res) => {
  assertMetaConfig();
  const template = await Template.findOne({ _id: req.params.id, business: req.user.business });
  if (!template) return res.status(404).json({ error: 'not found' });
  if (!['DRAFT', 'REJECTED'].includes(template.status)) {
    return res.status(409).json({ error: `cannot submit template in status ${template.status}` });
  }
  const result = await submitTemplate(template);
  template.metaTemplateId = result.id || '';
  template.status = 'PENDING';
  await template.save();
  res.json(template);
});

// Sync approval statuses back from Meta.
router.post('/sync', async (req, res) => {
  assertMetaConfig();
  const remote = await fetchTemplateStatuses();
  const byName = new Map(remote.map((t) => [`${t.name}:${t.language}`, t]));
  const locals = await Template.find({ business: req.user.business, status: { $in: ['PENDING', 'APPROVED', 'PAUSED'] } });
  for (const local of locals) {
    const match = byName.get(`${local.name}:${local.language}`);
    if (match && match.status !== local.status) {
      local.status = match.status;
      local.rejectionReason = match.rejected_reason || '';
      await local.save();
    }
  }
  res.json({ synced: locals.length });
});

export default router;
