import { Router } from 'express';
import { Contact, Suppression } from '../models.js';

const router = Router();

router.get('/', async (req, res) => {
  const filter = { business: req.user.business };
  if (req.query.group) filter.groups = req.query.group;
  const contacts = await Contact.find(filter).sort({ createdAt: -1 }).limit(500).lean();
  res.json(contacts);
});

// Manual opt-out: adds to the suppression list AND flips the contact record.
router.post('/:id/opt-out', async (req, res) => {
  const contact = await Contact.findOne({ _id: req.params.id, business: req.user.business });
  if (!contact) return res.status(404).json({ error: 'not found' });
  contact.optIn = { status: 'opted_out', source: 'dashboard', at: new Date() };
  await contact.save();
  await Suppression.updateOne(
    { business: req.user.business, phone: contact.phone },
    { $setOnInsert: { reason: 'manual opt-out', source: 'dashboard' } },
    { upsert: true }
  );
  res.json(contact);
});

router.post('/:id/opt-in', async (req, res) => {
  const contact = await Contact.findOne({ _id: req.params.id, business: req.user.business });
  if (!contact) return res.status(404).json({ error: 'not found' });
  contact.optIn = { status: 'opted_in', source: req.body?.source || 'dashboard', at: new Date() };
  await contact.save();
  await Suppression.deleteOne({ business: req.user.business, phone: contact.phone });
  res.json(contact);
});

export default router;
