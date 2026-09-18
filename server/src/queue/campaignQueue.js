import { Queue } from 'bullmq';
import { redisConnection } from './connection.js';

// Heavy background jobs that must not run inside an API request:
// "prepare-campaign" creates the Message rows + send jobs for a campaign.
export const campaignQueue = new Queue('campaign-jobs', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 1000,
  },
});
