import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { requireAuth } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import groupRoutes from './routes/groups.js';
import contactRoutes from './routes/contacts.js';
import importRoutes from './routes/imports.js';
import templateRoutes from './routes/templates.js';
import campaignRoutes from './routes/campaigns.js';
import webhookRoutes from './routes/webhook.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: config.clientUrl }));
  app.use(morgan('dev'));

  // Webhook needs the raw body for HMAC signature verification, so it mounts
  // before the JSON parser and keeps req.rawBody.
  app.use(
    '/webhooks/whatsapp',
    express.raw({ type: 'application/json' }),
    (req, res, next) => {
      req.rawBody = req.body;
      try {
        req.body = JSON.parse(req.rawBody.toString('utf8'));
      } catch {
        req.body = {};
      }
      next();
    },
    webhookRoutes
  );

  app.use(express.json({ limit: '2mb' }));
  app.use('/api/auth', rateLimit({ windowMs: 60_000, max: 30 }), authRoutes);
  app.use('/api/groups', requireAuth, groupRoutes);
  app.use('/api/contacts', requireAuth, contactRoutes);
  app.use('/api/imports', requireAuth, importRoutes);
  app.use('/api/templates', requireAuth, templateRoutes);
  app.use('/api/campaigns', requireAuth, campaignRoutes);

  // Liveness + readiness: reports the Mongo connection state so a load
  // balancer can route around an API process that lost its database.
  app.get('/health', async (req, res) => {
    const { readyState } = (await import('mongoose')).default.connection;
    const dbUp = readyState === 1;
    res.status(dbUp ? 200 : 503).json({ ok: dbUp, db: readyState });
  });

  // Central error handler - never leak stack traces to clients.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[api]', err.message);
    res.status(err.status || 500).json({ error: err.expose ? err.message : 'internal_error' });
  });

  return app;
}
