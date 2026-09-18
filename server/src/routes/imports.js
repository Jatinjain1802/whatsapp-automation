import { Router } from 'express';
import multer from 'multer';
import { readImportHeaders } from '../services/excelImport.js';
import { createImportPreview, confirmImport } from '../services/importService.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Step 1: upload file -> return headers so the UI can render column mapping.
router.post('/headers', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file is required' });
  const headers = readImportHeaders(req.file.buffer);
  res.json({ headers, filename: req.file.originalname });
});

// Step 2: upload + mapping -> validate, dedupe, stage rows, return a preview.
router.post('/preview', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file is required' });
    const mapping = JSON.parse(req.body.mapping || '{}');
    if (!mapping.phone) return res.status(400).json({ error: 'mapping.phone is required' });

    const result = await createImportPreview({
      businessId: req.user.business,
      filename: req.file.originalname,
      buffer: req.file.buffer,
      mapping,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// Step 3: confirm -> bulk-upsert Contacts, create/link Groups, record consent.
router.post('/:id/confirm', async (req, res, next) => {
  try {
    const result = await confirmImport({ jobId: req.params.id, businessId: req.user.business });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
