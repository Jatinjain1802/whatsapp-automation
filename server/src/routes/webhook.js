import { Router } from 'express';
import crypto from 'crypto';
import { config } from '../config.js';
import { Message, Contact, Suppression, Campaign } from '../models.js';

const router = Router();

// GET: Meta webhook verification handshake.
// https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === config.meta.webhookVerifyToken) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Verify X-Hub-Signature-256 against the app secret. Needs the raw body,
// which app.js mounts for this route before express.json().
function verifySignature(req) {
  if (!config.meta.appSecret) return true; // dev mode
  const signature = req.headers['x-hub-signature-256'] || '';
  const expected =
    'sha256=' + crypto.createHmac('sha256', config.meta.appSecret).update(req.rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// POST: delivery status updates + inbound messages (STOP handling).
// Meta expects a fast ack and batches many statuses per POST, so we ack first
// and then process the whole batch with a handful of bulk queries instead of
// one find+save per status.
router.post('/', async (req, res) => {
  if (!verifySignature(req)) return res.sendStatus(401);
  res.sendStatus(200); // ack immediately; process after

  try {
    const entries = req.body?.entry || [];
    const statuses = [];
    const inbound = [];
    for (const entry of entries) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        for (const status of value.statuses || []) statuses.push(status);
        for (const message of value.messages || []) inbound.push(message);
      }
    }
    if (statuses.length) await applyStatusBatch(statuses);
    for (const message of inbound) await applyInbound(message);
  } catch (err) {
    console.error('[webhook] processing error', err);
  }
});

// Status is monotonic per message: never downgrade read -> delivered -> sent.
// "failed" is terminal and always allowed to overwrite.
const RANK = { queued: 0, skipped: 0, sent: 1, delivered: 2, read: 3, failed: 9 };

async function applyStatusBatch(statuses) {
  // If Meta re-delivers or batches several updates for one wamid, only the
  // highest-rank (or failed) transition is applied.
  const latest = new Map();
  for (const status of statuses) {
    const prev = latest.get(status.id);
    if (!prev || (RANK[status.status] ?? -1) > (RANK[prev.status] ?? -1) || status.status === 'failed') {
      latest.set(status.id, status);
    }
  }

  const docs = await Message.find({ metaMessageId: { $in: [...latest.keys()] } }).select('_id campaign status metaMessageId');
  if (!docs.length) return;

  const messageOps = [];
  const campaignIncrements = new Map(); // `${campaignId}:${field}` -> count

  for (const doc of docs) {
    const status = latest.get(doc.metaMessageId ?? '');
    if (!status) continue;
    const update = buildTransition(status);
    if (!update) continue;
    // Skip downgrades (duplicate/out-of-order webhook events) - and a skipped
    // downgrade is never counted, so campaign stats stay exact.
    if (RANK[update.status] <= RANK[doc.status] && update.status !== 'failed') continue;

    messageOps.push({ updateOne: { filter: { _id: doc._id }, update: { $set: update } } });
    const field = { sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed' }[update.status];
    if (field && doc.campaign) {
      const key = `${doc.campaign}:${field}`;
      campaignIncrements.set(key, (campaignIncrements.get(key) || 0) + 1);
    }
  }

  if (messageOps.length) await Message.bulkWrite(messageOps, { ordered: false });
  if (campaignIncrements.size) {
    await Campaign.bulkWrite(
      [...campaignIncrements.entries()].map(([key, count]) => {
        const [campaignId, field] = key.split(':');
        return {
          updateOne: { filter: { _id: campaignId }, update: { $inc: { [`stats.${field}`]: count } } },
        };
      }),
      { ordered: false }
    );
  }
}

function buildTransition(status) {
  const now = new Date(Number(status.timestamp) * 1000);
  const transitions = {
    sent: { status: 'sent', sentAt: now },
    delivered: { status: 'delivered', deliveredAt: now },
    read: { status: 'read', readAt: now },
    failed: {
      status: 'failed',
      errorCode: String(status.errors?.[0]?.code || ''),
      errorMessage: status.errors?.[0]?.title || '',
    },
  };
  return transitions[status.status] || null;
}

const OPT_OUT_WORDS = new Set(['stop', 'unsubscribe', 'cancel', 'end', 'quit']);

async function applyInbound(message) {
  // Inbound messages open/refresh the 24-hour customer service window.
  const phone = `+${message.from}`;
  const text = (message.text?.body || '').trim().toLowerCase();

  const contact = await Contact.findOneAndUpdate(
    { phone },
    { $set: { lastInboundAt: new Date() } },
    { new: true }
  );

  if (contact && OPT_OUT_WORDS.has(text)) {
    contact.optIn = { status: 'opted_out', source: 'inbound STOP', at: new Date() };
    await contact.save();
    await Suppression.updateOne(
      { business: contact.business, phone: contact.phone },
      { $setOnInsert: { reason: 'inbound STOP keyword', source: 'webhook' } },
      { upsert: true }
    );
    console.log(`[webhook] opted out ${contact.phone}`);
  }
}

export default router;
