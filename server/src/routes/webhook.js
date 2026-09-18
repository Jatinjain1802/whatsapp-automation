import { Router, raw } from 'express';
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
router.post('/', async (req, res) => {
  if (!verifySignature(req)) return res.sendStatus(401);
  res.sendStatus(200); // ack immediately; process after

  try {
    const entries = req.body?.entry || [];
    for (const entry of entries) {
      for (const change of entry.changes || []) {
        const value = change.value || {};

        for (const status of value.statuses || []) {
          await applyStatus(status);
        }
        for (const message of value.messages || []) {
          await applyInbound(message);
        }
      }
    }
  } catch (err) {
    console.error('[webhook] processing error', err);
  }
});

async function applyStatus(status) {
  const doc = await Message.findOne({ metaMessageId: status.id });
  if (!doc) return;
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
  const update = transitions[status.status];
  if (!update) return;

  // Status is monotonic: never downgrade read -> delivered -> sent.
  const rank = { queued: 0, skipped: 0, failed: 9, sent: 1, delivered: 2, read: 3 };
  if (rank[update.status] <= rank[doc.status] && update.status !== 'failed') return;

  Object.assign(doc, update);
  await doc.save();
  if (doc.campaign) {
    const field = { sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed' }[update.status];
    if (field) await Campaign.updateOne({ _id: doc.campaign }, { $inc: { [`stats.${field}`]: 1 } });
  }
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
