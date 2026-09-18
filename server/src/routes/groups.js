import { Router } from 'express';
import { Group, Contact } from '../models.js';

const router = Router();

router.get('/', async (req, res) => {
  const groups = await Group.find({ business: req.user.business }).sort({ createdAt: -1 }).lean();
  const withCounts = await Promise.all(
    groups.map(async (g) => ({
      ...g,
      contactCount: await Contact.countDocuments({ business: req.user.business, groups: g._id }),
    }))
  );
  res.json(withCounts);
});

router.post('/', async (req, res) => {
  const { name, description } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const group = await Group.create({ business: req.user.business, name, description });
    res.status(201).json(group);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'group name already exists' });
    throw err;
  }
});

router.delete('/:id', async (req, res) => {
  await Group.deleteOne({ _id: req.params.id, business: req.user.business });
  // Group deletion only unlinks the segment; contacts are kept.
  await Contact.updateMany(
    { business: req.user.business },
    { $pull: { groups: req.params.id } }
  );
  res.status(204).end();
});

export default router;
