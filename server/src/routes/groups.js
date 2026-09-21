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

/*
  POST /groups — Create a new group segment and optionally assign contacts
  -----------------------------------------------------------------------
  LEARNING CONCEPTS:
  1. DESTUCTURING PAYLOAD — `const { name, description, contactCount, contactIds } = req.body`
     Extracts properties cleanly from the JSON request body.
  2. MONGOOSE $addToSet — Uniquely adds an element to an array field (groups).
     Unlike $push, $addToSet avoids adding duplicate group IDs to a contact.
  3. MONGOOSE $in OPERATOR — Matches documents whose field value equals any value
     in the specified array (e.g., `_id: { $in: targetIds }`).
*/
router.post('/', async (req, res) => {
  const { name, description, contactCount, contactIds } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });

  try {
    const group = await Group.create({ business: req.user.business, name, description });
    let addedCount = 0;

    // Mode A: User passed explicit array of contact IDs
    if (Array.isArray(contactIds) && contactIds.length > 0) {
      await Contact.updateMany(
        { _id: { $in: contactIds }, business: req.user.business },
        { $addToSet: { groups: group._id } }
      );
      addedCount = contactIds.length;
    }
    // Mode B: User passed a numerical contact count (e.g., 5 contacts)
    else if (contactCount && Number(contactCount) > 0) {
      const limitNum = Number(contactCount);
      const targetContacts = await Contact.find({ business: req.user.business })
        .sort({ createdAt: -1 })
        .limit(limitNum)
        .select('_id')
        .lean();

      if (targetContacts.length > 0) {
        const targetIds = targetContacts.map((c) => c._id);
        await Contact.updateMany(
          { _id: { $in: targetIds } },
          { $addToSet: { groups: group._id } }
        );
        addedCount = targetIds.length;
      }
    }

    res.status(201).json({
      ...group.toObject(),
      contactCount: addedCount,
    });
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
