import dotenv from 'dotenv';

dotenv.config();

// Every tunable that matters at scale lives here and is documented in
// .env.example. Defaults are safe for a laptop; production values come from env.
export const config = {
  port: Number(process.env.PORT || 4000),
  host: process.env.HOST || '0.0.0.0',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp-automation',
  mongo: {
    // Pool size caps concurrent in-flight Mongo operations per process.
    // API + worker each open their own connection, so size them together
    // against the Atlas tier limit.
    maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE || 50),
  },
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret',
  send: {
    // Worker throughput. Keep inside Meta's per-number Cloud API throughput
    // and, more importantly, the portfolio's messaging limit tier.
    rateLimitMax: Number(process.env.SEND_RATE_LIMIT_MAX || 20), // jobs
    rateLimitMs: Number(process.env.SEND_RATE_LIMIT_MS || 1000), // per window
    concurrency: Number(process.env.SEND_CONCURRENCY || 10), // parallel jobs per worker
  },
  batch: {
    // Mongo bulkWrite / insertMany chunk sizes. 1k-2k docs per round trip keeps
    // payloads small, memory flat, and lets the event loop breathe between chunks.
    importBatchSize: Number(process.env.IMPORT_BATCH_SIZE || 1000),
    campaignBatchSize: Number(process.env.CAMPAIGN_BATCH_SIZE || 2000),
  },
  meta: {
    apiVersion: process.env.META_API_VERSION || 'v21.0',
    accessToken: process.env.META_WHATSAPP_ACCESS_TOKEN || '',
    wabaId: process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID || '',
    phoneNumberId: process.env.META_WHATSAPP_PHONE_NUMBER_ID || '',
    appSecret: process.env.META_APP_SECRET || '',
    webhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN || '',
  },
};

export function assertMetaConfig() {
  const missing = Object.entries({
    META_WHATSAPP_ACCESS_TOKEN: config.meta.accessToken,
    META_WHATSAPP_BUSINESS_ACCOUNT_ID: config.meta.wabaId,
    META_WHATSAPP_PHONE_NUMBER_ID: config.meta.phoneNumberId,
  })
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    throw new Error(`Missing Meta configuration: ${missing.join(', ')}. See .env.example.`);
  }
}
