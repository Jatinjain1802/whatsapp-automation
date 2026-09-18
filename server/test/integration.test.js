// Integration test: real MongoDB (in-memory) + real Redis (BullMQ).
// Exercises the two scale pipelines end to end without the Meta API:
//   Excel buffer -> staged import -> bulk contact upsert -> suppression check
//   campaign confirm -> prepare job -> bulk Message rows -> deduped queue jobs
// First run downloads a MongoDB binary (~100MB, cached afterwards).
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6399';
process.env.IMPORT_BATCH_SIZE = '25'; // small batches so the test exercises chunking
process.env.CAMPAIGN_BATCH_SIZE = '25';

const { MongoMemoryServer } = await import('mongodb-memory-server');
const mongoose = (await import('mongoose')).default;
const xlsx = (await import('xlsx')).default;

const { Business, Group, Contact, Template, Campaign, Message, ImportRow, Suppression } = await import(
  '../src/models.js'
);
const { createImportPreview, confirmImport } = await import('../src/services/importService.js');
const { confirmAndEnqueue, prepareCampaign, refreshCampaignStatus, buildRecipientSnapshot } = await import(
  '../src/services/campaignService.js'
);
const { sendQueue } = await import('../src/queue/sendQueue.js');
const { campaignQueue } = await import('../src/queue/campaignQueue.js');
const { redisConnection } = await import('../src/queue/connection.js');

function makeBuffer(rows) {
  const ws = xlsx.utils.aoa_to_sheet(rows);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'Sheet1');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

test('import + campaign pipelines at batch scale', async (t) => {
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  t.after(async () => {
    await sendQueue.obliterate({ force: true }).catch(() => {});
    await campaignQueue.obliterate({ force: true }).catch(() => {});
    await sendQueue.close();
    await campaignQueue.close();
    redisConnection.disconnect();
    await mongoose.disconnect();
    await mongod.stop();
  });

  // --- Seed business + a suppression entry ---------------------------
  const business = await Business.create({ name: 'Test Co' });
  await Suppression.create({ business: business._id, phone: '+919000000001', reason: 'STOP' });

  // --- Import pipeline ------------------------------------------------
  const HEADER = ['Name', 'Mobile', 'Segment', 'Consent'];
  const MAPPING = { name: 'Name', phone: 'Mobile', group: 'Segment', consentStatus: 'Consent' };
  const rows = [HEADER];
  for (let i = 0; i < 120; i += 1) rows.push([`Customer ${i}`, `9${String(i).padStart(9, '0')}`, 'vip', 'yes']);
  rows.push(['Dup', '9000000000', 'vip', 'yes']); // duplicate of row 1's number
  rows.push(['Bad', '12', 'vip', 'yes']); // invalid phone

  const buffer = makeBuffer(rows);
  const preview = await createImportPreview({ businessId: business._id, filename: 't.xlsx', buffer, mapping: MAPPING });
  assert.equal(preview.stats.totalRows, 122);
  assert.equal(preview.stats.valid, 120);
  assert.equal(preview.stats.duplicates, 1);
  assert.equal(preview.stats.invalid, 1);
  assert.equal(preview.sample.length, 10);
  // Rows are staged in their own collection, not embedded in the job doc.
  assert.equal(await ImportRow.countDocuments({ job: preview.importJobId }), 120);

  const result = await confirmImport({ jobId: preview.importJobId, businessId: business._id });
  assert.equal(result.imported, 120);
  assert.equal(await Contact.countDocuments({ business: business._id }), 120);
  assert.equal(await ImportRow.countDocuments({ job: preview.importJobId }), 0); // staging cleaned

  // Suppression wins over the file's "yes" consent.
  const suppressedContact = await Contact.findOne({ business: business._id, phone: '+919000000001' });
  assert.equal(suppressedContact.optIn.status, 'opted_out');

  // Group created once and linked to imported contacts.
  const vip = await Group.findOne({ business: business._id, name: 'vip' });
  assert.ok(vip);
  assert.equal(await Contact.countDocuments({ business: business._id, groups: vip._id }), 120);

  // Re-confirm is a safe no-op.
  const again = await confirmImport({ jobId: preview.importJobId, businessId: business._id });
  assert.equal(again.already, true);

  // --- Campaign pipeline ----------------------------------------------
  const template = await Template.create({
    business: business._id, name: 'order_update', category: 'UTILITY',
    bodyText: 'Hi {{1}}', status: 'APPROVED',
  });
  const campaign = await Campaign.create({
    business: business._id, name: 'Launch', group: vip._id, template: template._id,
    variableMapping: { 1: 'name' },
  });

  // 119 opted-in (1 suppressed), so the snapshot excludes exactly one contact.
  const snapshot = await buildRecipientSnapshot(campaign);
  assert.equal(snapshot.eligible.length, 119);
  assert.equal(snapshot.skippedNoConsent, 1);

  const stamped = await confirmAndEnqueue(campaign._id);
  assert.equal(stamped.status, 'queuing');
  assert.ok(await campaignQueue.getJob(`prepare-${campaign._id}`)); // dedupe-keyed job exists

  // Simulate the worker running the prepare job, twice (crash + retry).
  await prepareCampaign(campaign._id.toString());
  await prepareCampaign(campaign._id.toString());

  assert.equal(await Message.countDocuments({ campaign: campaign._id }), 119); // no dupes after retry
  const updated = await Campaign.findById(campaign._id);
  assert.equal(updated.status, 'sending');
  assert.equal(updated.stats.queued, 119);

  const jobCounts = await sendQueue.getJobCounts('waiting', 'delayed', 'active');
  const queuedJobs = (jobCounts.waiting || 0) + (jobCounts.delayed || 0) + (jobCounts.active || 0);
  assert.equal(queuedJobs, 119); // BullMQ jobId dedupe survived the retry

  // Stats recompute from messages + completion detection.
  await Message.updateMany({ campaign: campaign._id }, { $set: { status: 'delivered' } });
  await refreshCampaignStatus(campaign._id);
  const done = await Campaign.findById(campaign._id);
  assert.equal(done.status, 'completed');
  assert.equal(done.stats.delivered, 119);
});
