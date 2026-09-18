import { Router } from 'express';
import { Campaign, Message, Template, Group } from '../models.js';
import { buildRecipientSnapshot, confirmAndEnqueue, refreshCampaignStatus } from '../services/campaignService.js';

const router = Router();

router.get('/', async (req, res) => {
  const campaigns = await Campaign.find({ business: req.user.business })
    .populate('group template', 'name category status')
    .sort({ createdAt: -1 })
    .lean();
  res.json(campaigns);
});

router.post('/', async (req, res) => {
  const { name, groupId, templateId, variableMapping } = req.body || {};
  if (!name || !groupId || !templateId) {
    return res.status(400).json({ error: 'name, groupId and templateId are required' });
  }
  const template = await Template.findOne({ _id: templateId, business: req.user.business });
  if (!template) return res.status(404).json({ error: 'template not found' });
  if (template.status !== 'APPROVED') {
    return res.status(409).json({ error: 'only Meta-APPROVED templates can be used in a campaign' });
  }
  const group = await Group.findOne({ _id: groupId, business: req.user.business });
  if (!group) return res.status(404).json({ error: 'group not found' });

  const campaign = await Campaign.create({
    business: req.user.business,
    name,
    group: groupId,
    template: templateId,
    variableMapping: variableMapping || {},
  });
  res.status(201).json(campaign);
});

// Preview before sending: recipient count, consent exclusions, sample render.
router.get('/:id/preview', async (req, res) => {
  const campaign = await Campaign.findOne({ _id: req.params.id, business: req.user.business }).populate('template');
  if (!campaign) return res.status(404).json({ error: 'not found' });
  const snapshot = await buildRecipientSnapshot(campaign);

  const sampleContact = await (await import('../models.js')).Contact.findOne({ _id: snapshot.eligible[0] }).lean();
  let sampleBody = campaign.template.bodyText;
  if (sampleContact) {
    for (const [key, path] of Object.entries(campaign.variableMapping || {})) {
      const value = path.startsWith('customFields.')
        ? sampleContact.customFields?.[path.slice(13)]
        : sampleContact[path];
      sampleBody = sampleBody.replaceAll(`{{${key}}}`, String(value ?? ''));
    }
  }
  res.json({
    recipients: snapshot.eligible.length,
    skippedNoConsent: snapshot.skippedNoConsent,
    totalInGroup: snapshot.totalInGroup,
    sampleBody,
    template: { name: campaign.template.name, category: campaign.template.category },
  });
});

// Confirm and start sending. This is the only endpoint that enqueues jobs.
router.post('/:id/send', async (req, res) => {
  const campaign = await Campaign.findOne({ _id: req.params.id, business: req.user.business });
  if (!campaign) return res.status(404).json({ error: 'not found' });
  const updated = await confirmAndEnqueue(campaign._id);
  res.json(updated);
});

router.get('/:id', async (req, res) => {
  const campaign = await Campaign.findOne({ _id: req.params.id, business: req.user.business })
    .populate('group template', 'name category status')
    .lean();
  if (!campaign) return res.status(404).json({ error: 'not found' });
  await refreshCampaignStatus(campaign._id);
  res.json(campaign);
});

// Per-recipient delivery detail + failed list for CSV export.
router.get('/:id/messages', async (req, res) => {
  const filter = { campaign: req.params.id, business: req.user.business };
  if (req.query.status) filter.status = req.query.status;
  const messages = await Message.find(filter)
    .populate('contact', 'name phone')
    .sort({ createdAt: -1 })
    .limit(1000)
    .lean();
  res.json(messages);
});

export default router;
