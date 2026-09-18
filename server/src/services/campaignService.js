import mongoose from 'mongoose';
import { Contact, Campaign, Message, Suppression } from '../models.js';
import { sendQueue } from '../queue/sendQueue.js';
import { campaignQueue } from '../queue/campaignQueue.js';
import { config } from '../config.js';

// Build the recipient list for a campaign. Runs at preview time, at confirm
// time, and again inside the prepare job; consent and suppression are also
// re-checked per message inside the send worker.
export async function buildRecipientSnapshot(campaign) {
  const contacts = await Contact.find({
    business: campaign.business,
    groups: campaign.group,
  })
    .select('_id phone optIn')
    .lean();

  const suppressedPhones = new Set(
    (await Suppression.find({ business: campaign.business }).select('phone').lean()).map((s) => s.phone)
  );

  const eligible = [];
  let skippedNoConsent = 0;
  for (const c of contacts) {
    if (c.optIn?.status !== 'opted_in' || suppressedPhones.has(c.phone)) {
      skippedNoConsent += 1;
      continue;
    }
    eligible.push(c._id);
  }
  return { eligible, skippedNoConsent, totalInGroup: contacts.length };
}

// Confirm: freeze stats, flip the campaign to "queuing" and hand the heavy
// work to the background prepare job. The HTTP request returns immediately,
// so confirming a 500k-recipient campaign cannot time out.
// Idempotent: re-confirming a queued/sending/completed campaign is a no-op,
// and the prepare job is deduped by jobId.
export async function confirmAndEnqueue(campaignId) {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) {
    const err = new Error('campaign not found');
    err.status = 404;
    err.expose = true;
    throw err;
  }
  if (['queuing', 'sending', 'completed'].includes(campaign.status)) return campaign;

  const { eligible, skippedNoConsent } = await buildRecipientSnapshot(campaign);

  campaign.status = 'queuing';
  campaign.sentAt = new Date();
  campaign.stats.total = eligible.length;
  campaign.stats.skippedNoConsent = skippedNoConsent;
  campaign.stats.queued = 0;
  await campaign.save();

  await campaignQueue.add(
    'prepare-campaign',
    { campaignId: campaign._id.toString() },
    {
      jobId: `prepare-${campaign._id}`, // BullMQ dedupes on jobId (no ':' allowed in ids)
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
    }
  );
  return campaign;
}

// Runs inside the worker, never in the API process. Creates one Message row
// and one send job per recipient in bulk chunks:
//   - Message rows: upsert with $setOnInsert on the unique idempotencyKey, so
//     a retried prepare job never duplicates a row.
//   - Send jobs: BullMQ dedupes on jobId (= idempotencyKey), so a retry after
//     a crash between Mongo and Redis only enqueues what is still missing.
export async function prepareCampaign(campaignId) {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw new Error(`campaign ${campaignId} not found`);
  if (['sending', 'completed'].includes(campaign.status)) return { already: true };

  // Re-check consent/suppression at prepare time - the group may have changed
  // since the draft was confirmed.
  const { eligible, skippedNoConsent } = await buildRecipientSnapshot(campaign);
  const batchSize = config.batch.campaignBatchSize;

  let queued = 0;
  for (let i = 0; i < eligible.length; i += batchSize) {
    const ids = eligible.slice(i, i + batchSize);
    const contacts = await Contact.find({ _id: { $in: ids } }).select('_id phone').lean();

    await Message.bulkWrite(
      contacts.map((c) => {
        const idempotencyKey = `${campaign._id}:${c._id}`;
        return {
          updateOne: {
            filter: { idempotencyKey },
            update: {
              $setOnInsert: {
                _id: new mongoose.Types.ObjectId(),
                campaign: campaign._id,
                business: campaign.business,
                contact: c._id,
                phone: c.phone,
                idempotencyKey,
                status: 'queued',
              },
            },
            upsert: true,
          },
        };
      }),
      { ordered: false }
    );

    // Read the rows back so job data carries the real Message _id whether the
    // row was just inserted or already existed from a previous (crashed) run.
    const messages = await Message.find({ campaign: campaign._id, contact: { $in: ids } })
      .select('_id contact idempotencyKey')
      .lean();

    await sendQueue.addBulk(
      messages.map((m) => ({
        name: 'send-template',
        data: { messageId: m._id.toString(), idempotencyKey: m.idempotencyKey },
        opts: { jobId: `send-${m._id}` }, // stable across prepare retries, deduped by BullMQ
      }))
    );

    queued += messages.length;
    await Campaign.updateOne(
      { _id: campaign._id },
      { $set: { 'stats.queued': queued, 'stats.total': eligible.length, 'stats.skippedNoConsent': skippedNoConsent } }
    );
    console.log(`[campaign] ${campaignId}: queued ${queued}/${eligible.length}`);
  }

  await Campaign.updateOne(
    { _id: campaign._id },
    { $set: { status: 'sending', 'stats.queued': queued } }
  );
  return { queued };
}

// Recompute campaign stats from the messages collection (source of truth) and
// mark the campaign completed once nothing is left in "queued".
export async function refreshCampaignStatus(campaignId) {
  const counts = await Message.aggregate([
    { $match: { campaign: campaignId } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const byStatus = Object.fromEntries(counts.map((c) => [c._id, c.count]));
  const update = {
    'stats.sent': byStatus.sent || 0,
    'stats.delivered': byStatus.delivered || 0,
    'stats.read': byStatus.read || 0,
    'stats.failed': byStatus.failed || 0,
  };
  const done =
    (byStatus.failed || 0) +
    (byStatus.sent || 0) +
    (byStatus.delivered || 0) +
    (byStatus.read || 0) +
    (byStatus.skipped || 0);
  const campaign = await Campaign.findById(campaignId).select('status stats.total').lean();
  if (campaign && campaign.status === 'sending' && campaign.stats.total > 0 && done >= campaign.stats.total) {
    update.status = 'completed';
  }
  await Campaign.updateOne({ _id: campaignId }, { $set: update });
  return byStatus;
}
