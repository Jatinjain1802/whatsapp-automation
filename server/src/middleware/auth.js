import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { User } from '../models.js';

// Minimal JWT guard. Attaches req.user (with req.user.business) to every
// authenticated request. Replace with your IdP/session strategy as you grow.
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing_token' });
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(payload.sub).lean();
    if (!user) return res.status(401).json({ error: 'unknown_user' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'invalid_token' });
  }
}

export function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), email: user.email }, config.jwtSecret, {
    expiresIn: '7d',
  });
}
