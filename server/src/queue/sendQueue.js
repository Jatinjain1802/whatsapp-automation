import { Queue } from 'bullmq';
import { redisConnection } from './connection.js';

// One queue for all outbound WhatsApp messages. Rate limiting is enforced by
// the worker (limiter option), not here.
export const sendQueue = new Queue('whatsapp-send', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});
