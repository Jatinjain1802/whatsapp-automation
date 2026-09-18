import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User, Business } from '../models.js';
import { signToken } from '../middleware/auth.js';

const router = Router();

// MVP auth: one user owns one business. Harden before multi-tenant SaaS
// (email verification, password reset, rate limiting, org roles).
router.post('/register', async (req, res) => {
  const { email, password, name, businessName } = req.body || {};
  if (!email || !password || !businessName) {
    return res.status(400).json({ error: 'email, password and businessName are required' });
  }
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) return res.status(409).json({ error: 'email already registered' });

  const business = await Business.create({ name: businessName });
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ email, passwordHash, name, business: business._id });
  res.status(201).json({ token: signToken(user), businessId: business._id });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  const user = await User.findOne({ email: String(email || '').toLowerCase() });
  if (!user || !(await bcrypt.compare(String(password || ''), user.passwordHash))) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  res.json({ token: signToken(user), businessId: user.business });
});

export default router;
