import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 4000),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp-automation',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret',
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
