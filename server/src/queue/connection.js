import IORedis from 'ioredis';
import { config } from '../config.js';

// Shared Redis connection for BullMQ. maxRetriesPerRequest must be null for workers.
export const redisConnection = new IORedis(config.redisUrl, {
  maxRetriesPerRequest: null,
});
