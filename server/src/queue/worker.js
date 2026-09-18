import { Worker } from 'bullmq';
import { redisConnection } from './connection.js';
import { connectDb, disconnectDb } from '../db.js';
import { Message, Suppression, Campaign } from '../models.js';
import { sendTemplateMessage } from '../services/metaApi.js';
import { buildTemplateParams } from '../services/templateParams.js';
import { prepareCampaign } from '../services/campaignService.js';
import { config } from '../config.js';

// Run with: npm run worker
// One process, two workers:
//   - whatsapp-send: one job = one recipient. BullMQ's limiter keeps us inside
//     Meta's per-number throughput; portfolio messaging-limit tiers (e.g. 250
//     business-initiated conversations/24h for new portfolios) are a Meta-side
//     cap the business must grow out of via quality rating.
//   - campaign-jobs: heavy one-per-campaign jobs (prepare = create Message
//     rows + send jobs in bulk). Kept out of the API process on purpose.

// Meta errors that will never succeed on retry (invalid number, no opt-in,
// template paused/invalid, ...). Everything else (429, 5xx, network) retries
// with exponential backoff.
const PERMANENT_META_ERRORS = new Set([131030, 131026, 131047, 132015, 132012]);

async function processSendJob(job) {
  const { messageId, idempotencyKey } = job.data;
  // Fallback by idempotencyKey covers jobs enqueued before a crash rewrite.
  let doc = await Message.findById(messageId).populate('campaign contact');
  if (!doc && idempotencyKey) {
    doc = await Message.findOne({ idempotencyKey }).populate('campaign contact');
  }
  if (!doc || doc.status !== 'queued') return; // already handled (idempotent re-entry)

  const suppressed = await Suppression.exists({ business: doc.business, phone: doc.phone });
  if (suppressed) {
    doc.status = 'skipped';
    doc.errorMessage = 'recipient is on the suppression list';
    await doc.save();
    // No webhook will ever fire for a skipped message, so the worker counts it.
    await Campaign.updateOne({ _id: doc.campaign._id }, { $inc: { 'stats.skippedNoConsent': 1 } });
    return;
  }

  const campaign = doc.campaign;
  await campaign.populate('template');
  const template = campaign.template;
  const params = buildTemplateParams(campaign.variableMapping, doc.contact);

  try {
    const result = await sendTemplateMessage({
      to: doc.phone,
      templateName: template.name,
      language: template.language,
      bodyParams: params,
    });
    doc.metaMessageId = result.messages?.[0]?.id || '';
    doc.status = 'sent';
    doc.sentAt = new Date();
    await doc.save();
    // Note: campaign stats for sent/delivered/read/failed are owned by the
    // webhook handler (one counter per Meta event, no double counting) and by
    // refreshCampaignStatus(), which recomputes from the messages collection.
  } catch (err) {
    const apiErr = err.response?.data?.error;
    doc.errorCode = String(apiErr?.code || '');
    doc.errorMessage = apiErr?.message || err.message;
    const permanent = PERMANENT_META_ERRORS.has(apiErr?.code);
    const lastAttempt = job.attemptsMade + 1 >= (job.opts.attempts || 1);

    if (permanent || lastAttempt) {
      // Never retry permanent errors; a transient error on its final attempt
      // must still close out or the campaign would hang in "sending" forever.
      doc.status = 'failed';
      await doc.save();
      await Campaign.updateOne({ _id: campaign._id }, { $inc: { 'stats.failed': 1 } });
      if (!permanent) console.error('[worker] job exhausted retries', job.id, doc.errorMessage);
      return; // swallow -> no retry
    }
    doc.status = 'queued';
    await doc.save();
    throw err; // let BullMQ backoff retry transient failures
  }
}

async function processCampaignJob(job) {
  if (job.name !== 'prepare-campaign') return;
  const result = await prepareCampaign(job.data.campaignId);
  console.log('[worker] prepare-campaign done', job.data.campaignId, JSON.stringify(result));
}

async function main() {
  await connectDb();

  const sendWorker = new Worker('whatsapp-send', processSendJob, {
    connection: redisConnection,
    concurrency: config.send.concurrency,
    limiter: { max: config.send.rateLimitMax, duration: config.send.rateLimitMs },
  });
  sendWorker.on('failed', (job, err) => console.error('[worker] send job failed', job?.id, err.message));

  const campaignWorker = new Worker('campaign-jobs', processCampaignJob, {
    connection: redisConnection,
    concurrency: 1, // one prepare at a time keeps Mongo/Redis load predictable
  });
  campaignWorker.on('failed', (job, err) => console.error('[worker] campaign job failed', job?.id, err.message));

  console.log(
    `[worker] listening: whatsapp-send (concurrency=${config.send.concurrency}, ` +
      `limit=${config.send.rateLimitMax}/${config.send.rateLimitMs}ms) + campaign-jobs`
  );

  // Graceful shutdown: stop picking up new jobs, let in-flight sends finish,
  // then close connections. Docker/systemd send SIGTERM.
  async function shutdown(signal) {
    console.log(`[worker] ${signal} received, shutting down`);
    await Promise.all([sendWorker.close(), campaignWorker.close()]);
    await disconnectDb();
    await redisConnection.quit();
    process.exit(0);
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[worker] fatal', err);
  process.exit(1);
});
