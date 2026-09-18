import { Worker } from 'bullmq';
import { redisConnection } from './connection.js';
import { connectDb } from '../db.js';
import { Message, Suppression, Campaign } from '../models.js';
import { sendTemplateMessage } from '../services/metaApi.js';

// Run with: npm run worker
// Processes one job = one recipient. BullMQ's limiter keeps us inside Meta's
// per-number throughput expectations; Meta's per-portfolio messaging limits
// (e.g. 250 business-initiated conversations/24h for new portfolios) are
// enforced at campaign-confirm time in campaignService.

const RATE_LIMIT_MAX = Number(process.env.SEND_RATE_LIMIT_MAX || 20); // messages
const RATE_LIMIT_DURATION = Number(process.env.SEND_RATE_LIMIT_MS || 1000); // per second

async function processJob(job) {
  const { messageId } = job.data;
  const doc = await Message.findById(messageId).populate('campaign contact');
  if (!doc || doc.status !== 'queued') return; // already handled (idempotent re-entry)

  const suppressed = await Suppression.exists({ business: doc.business, phone: doc.phone });
  if (suppressed) {
    doc.status = 'skipped';
    doc.errorMessage = 'recipient is on the suppression list';
    await doc.save();
    await bumpStats(doc.campaign._id, 'skippedNoConsent');
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
    await bumpStats(campaign._id, 'sent');
  } catch (err) {
    const apiErr = err.response?.data?.error;
    doc.errorCode = String(apiErr?.code || '');
    doc.errorMessage = apiErr?.message || err.message;
    // Permanent errors (invalid number, no opt-in, template paused) must not retry.
    const permanent = [131030, 131026, 131047, 132015, 132012].includes(apiErr?.code);
    doc.status = permanent ? 'failed' : 'queued';
    await doc.save();
    if (permanent) {
      await bumpStats(campaign._id, 'failed');
      return; // swallow -> no retry
    }
    throw err; // let BullMQ backoff retry transient failures
  }
}

function buildTemplateParams(mapping, contact) {
  // mapping: { "1": "name", "2": "customFields.orderId" }
  const entries = Object.entries(mapping || {}).sort(([a], [b]) => Number(a) - Number(b));
  return entries.map(([, path]) => resolvePath(contact, path));
}

function resolvePath(contact, path) {
  if (!path) return '';
  if (path.startsWith('customFields.')) return contact.customFields?.get(path.slice(13)) ?? '';
  return contact[path] ?? '';
}

async function bumpStats(campaignId, field) {
  await Campaign.updateOne({ _id: campaignId }, { $inc: { [`stats.${field}`]: 1 } });
}

async function main() {
  await connectDb();
  const worker = new Worker('whatsapp-send', processJob, {
    connection: redisConnection,
    concurrency: 5,
    limiter: { max: RATE_LIMIT_MAX, duration: RATE_LIMIT_DURATION },
  });
  worker.on('failed', (job, err) => console.error('[worker] job failed', job?.id, err.message));
  console.log('[worker] listening on whatsapp-send queue');
}

main().catch((err) => {
  console.error('[worker] fatal', err);
  process.exit(1);
});
