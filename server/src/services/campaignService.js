import { Contact, Campaign, Message, Suppression } from '../models.js';
import { sendQueue } from '../queue/sendQueue.js';

// Build the recipient snapshot and preview for a campaign. Runs at draft time
// and again at confirm time; consent and suppression are re-checked on every
// send inside the worker as well.
export async function buildRecipientSnapshot(campaign) {
  const contacts = await Contact.find({
    business: campaign.business,
    groups: campaign.group,
  }).lean();

  const suppressed = await Suppression.find({ business: campaign.business }).lean();
  const suppressedPhones = new Set(suppressed.map((s) => s.phone));

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

// Confirm + enqueue. Freezes the snapshot, creates one Message row and one
// queue job per recipient. Idempotent: re-confirming a sending campaign is a no-op.
export async function confirmAndEnqueue(campaignId) {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw new Error('campaign not found');
  if (['sending', 'completed'].includes(campaign.status)) return campaign;

  const { eligible, skippedNoConsent } = await buildRecipientSnapshot(campaign);

  campaign.recipientSnapshot = eligible;
  campaign.status = 'sending';
  campaign.sentAt = new Date();
  campaign.stats.total = eligible.length;
  campaign.stats.skippedNoConsent = skippedNoConsent;
  await campaign.save();

  const jobs = [];
  for (const contactId of eligible) {
    const idempotencyKey = `${campaign._id}:${contactId}`;
    await Message.updateOne(
      { idempotencyKey },
      {
        $setOnInsert: {
          campaign: campaign._id,
          business: campaign.business,
          contact: contactId,
          phone: '', // filled below for new rows only via post hook of create
          idempotencyKey,
          status: 'queued',
        },
      },
      { upsert: true }
    );
    const msg = await Message.findOne({ idempotencyKey });
    const contact = await Contact.findById(contactId).lean();
    if (!msg.phone) {
      msg.phone = contact.phone;
      await msg.save();
    }
    jobs.push({
      name: 'send-template',
      data: { messageId: msg._id.toString() },
      opts: { jobId: idempotencyKey }, // BullMQ dedupes on jobId
    });
  }

  await sendQueue.addBulk(jobs);
  await Campaign.updateOne({ _id: campaignId }, { $set: { 'stats.queued': jobs.length } });
  return campaign;
}

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
  const done = (byStatus.failed || 0) + (byStatus.sent || 0) + (byStatus.delivered || 0) + (byStatus.read || 0) + (byStatus.skipped || 0);
  const campaign = await Campaign.findById(campaignId);
  if (campaign && done >= campaign.stats.total && campaign.status === 'sending') {
    update.status = 'completed';
  }
  await Campaign.updateOne({ _id: campaignId }, { $set: update });
  return byStatus;
}
