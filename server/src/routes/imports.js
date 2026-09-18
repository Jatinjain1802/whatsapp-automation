import { Router } from 'express';
import multer from 'multer';
import { ImportJob, Contact, Group, Suppression } from '../models.js';
import { parseImportBuffer, readImportHeaders } from '../services/excelImport.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Step 1: upload file -> return headers so the UI can render column mapping.
router.post('/headers', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file is required' });
  const headers = readImportHeaders(req.file.buffer);
  res.json({ headers, filename: req.file.originalname });
});

// Step 2: upload + mapping -> validate, dedupe, store a preview ImportJob.
router.post('/preview', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file is required' });
  const mapping = JSON.parse(req.body.mapping || '{}');
  if (!mapping.phone) return res.status(400).json({ error: 'mapping.phone is required' });

  const { preview, errors, stats } = parseImportBuffer(req.file.buffer, mapping);
  const job = await ImportJob.create({
    business: req.user.business,
    filename: req.file.originalname,
    columnMapping: mapping,
    previewRows: preview,
    errors,
    stats,
  });
  res.status(201).json({ importJobId: job._id, stats, errors: errors.slice(0, 50), sample: preview.slice(0, 10) });
});

// Step 3: confirm -> upsert Contacts, create/link Groups, record consent.
router.post('/:id/confirm', async (req, res) => {
  const job = await ImportJob.findOne({ _id: req.params.id, business: req.user.business });
  if (!job) return res.status(404).json({ error: 'import not found' });
  if (job.status === 'confirmed') return res.json({ ok: true, already: true });

  const suppressed = await Suppression.find({ business: job.business }).lean();
  const suppressedPhones = new Set(suppressed.map((s) => s.phone));
  const groupCache = new Map();

  let imported = 0;
  for (const row of job.previewRows) {
    let groupIds = [];
    if (row.group) {
      if (!groupCache.has(row.group)) {
        const group = await Group.findOneAndUpdate(
          { business: job.business, name: row.group },
          { $setOnInsert: { business: job.business, name: row.group } },
          { upsert: true, new: true }
        );
        groupCache.set(row.group, group._id);
      }
      groupIds = [groupCache.get(row.group)];
    }

    // Never resurrect consent for a suppressed number.
    const optIn = suppressedPhones.has(row.phone)
      ? { status: 'opted_out', source: 'suppression list', at: new Date() }
      : row.optIn;

    await Contact.updateOne(
      { business: job.business, phone: row.phone },
      {
        $set: { name: row.name, optIn, customFields: row.customFields },
        $addToSet: { groups: { $each: groupIds } },
        $setOnInsert: { business: job.business, phone: row.phone },
      },
      { upsert: true }
    );
    imported += 1;
  }

  job.status = 'confirmed';
  job.previewRows = []; // do not keep raw uploads around longer than needed
  await job.save();
  res.json({ ok: true, imported });
});

export default router;
