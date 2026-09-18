import mongoose from 'mongoose';

const { Schema, model } = mongoose;

// One business = one WhatsApp Business Account (WABA) connection.
// NOTE: access tokens stored here must be encrypted at rest before production use.
const businessSchema = new Schema(
  {
    name: { type: String, required: true },
    wabaId: { type: String, default: '' },
    phoneNumberId: { type: String, default: '' },
    displayPhone: { type: String, default: '' },
    // Encrypted token reference - do not log or return from the API.
    accessTokenEnc: { type: String, default: '' },
    webhookSubscribed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, default: '' },
    business: { type: Schema.Types.ObjectId, ref: 'Business' },
  },
  { timestamps: true }
);

const groupSchema = new Schema(
  {
    business: { type: Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
  },
  { timestamps: true }
);
groupSchema.index({ business: 1, name: 1 }, { unique: true });

// Consent is first-class data: WhatsApp policy requires opt-in before any
// business-initiated message. Never message a contact without it.
const optInSchema = new Schema(
  {
    status: { type: String, enum: ['opted_in', 'opted_out', 'unknown'], default: 'unknown' },
    source: { type: String, default: '' }, // e.g. "excel import", "website form", "inbound message"
    at: { type: Date },
  },
  { _id: false }
);

const contactSchema = new Schema(
  {
    business: { type: Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    name: { type: String, default: '' },
    phone: { type: String, required: true }, // E.164, e.g. +919876543210
    groups: [{ type: Schema.Types.ObjectId, ref: 'Group' }],
    optIn: { type: optInSchema, default: () => ({}) },
    customFields: { type: Map, of: String, default: {} },
    lastInboundAt: { type: Date }, // drives the 24-hour customer service window
  },
  { timestamps: true }
);
contactSchema.index({ business: 1, phone: 1 }, { unique: true });
// Campaign snapshots query "all contacts of business X in group Y".
contactSchema.index({ business: 1, groups: 1 });

const templateSchema = new Schema(
  {
    business: { type: Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    name: { type: String, required: true }, // lowercase_with_underscores, as Meta requires
    language: { type: String, default: 'en' },
    category: { type: String, enum: ['UTILITY', 'MARKETING', 'AUTHENTICATION'], required: true },
    bodyText: { type: String, required: true }, // with {{1}} {{2}} placeholders
    headerText: { type: String, default: '' },
    footerText: { type: String, default: '' },
    metaTemplateId: { type: String, default: '' },
    status: { type: String, enum: ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'PAUSED'], default: 'DRAFT' },
    rejectionReason: { type: String, default: '' },
  },
  { timestamps: true }
);
templateSchema.index({ business: 1, name: 1, language: 1 }, { unique: true });

// Status flow: draft -> queuing -> sending -> completed (failed/cancelled aside).
// "queuing" means the background prepare job is still creating Message rows
// and queue jobs; no sends happen before it finishes stamping the campaign.
const campaignSchema = new Schema(
  {
    business: { type: Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    name: { type: String, required: true },
    group: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    template: { type: Schema.Types.ObjectId, ref: 'Template', required: true },
    // {{1}} -> "name", {{2}} -> "customFields.orderId", etc.
    variableMapping: { type: Map, of: String, default: {} },
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'queuing', 'sending', 'completed', 'failed', 'cancelled'],
      default: 'draft',
    },
    // NOTE: there is deliberately no recipient id array here. The "frozen
    // snapshot" is the messages collection itself - one Message row per
    // (campaign, contact) - because embedding hundreds of thousands of ids in
    // one document hits MongoDB's 16MB document limit.
    stats: {
      total: { type: Number, default: 0 },
      skippedNoConsent: { type: Number, default: 0 },
      queued: { type: Number, default: 0 },
      sent: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      read: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
    },
    sentAt: { type: Date },
  },
  { timestamps: true }
);

const messageSchema = new Schema(
  {
    campaign: { type: Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
    business: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    contact: { type: Schema.Types.ObjectId, ref: 'Contact', required: true },
    phone: { type: String, required: true },
    metaMessageId: { type: String, default: '' }, // wamid returned by the Cloud API
    status: {
      type: String,
      enum: ['queued', 'sent', 'delivered', 'read', 'failed', 'skipped'],
      default: 'queued',
      index: true,
    },
    errorCode: { type: String, default: '' },
    errorMessage: { type: String, default: '' },
    sentAt: { type: Date },
    deliveredAt: { type: Date },
    readAt: { type: Date },
    // Idempotency: one row per (campaign, contact); the queue job key reuses it,
    // so a retried or duplicated job can never send the same person twice.
    idempotencyKey: { type: String, required: true, unique: true },
  },
  { timestamps: true }
);
// Report page filters + campaign stats aggregation group by (campaign, status).
messageSchema.index({ campaign: 1, status: 1 });
// Webhook status updates look messages up by wamid.
messageSchema.index({ metaMessageId: 1 }, { sparse: true });

const importJobSchema = new Schema(
  {
    business: { type: Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    filename: { type: String, required: true },
    status: { type: String, enum: ['preview', 'processing', 'confirmed', 'failed'], default: 'preview' },
    columnMapping: { type: Map, of: String, default: {} },
    stats: {
      totalRows: { type: Number, default: 0 },
      valid: { type: Number, default: 0 },
      duplicates: { type: Number, default: 0 },
      invalid: { type: Number, default: 0 },
      imported: { type: Number, default: 0 },
    },
    // Only a small sample stays on the job document. Full validated rows live
    // in the importrows collection (one doc per row), so a 100k-row upload
    // never approaches the 16MB document limit.
    sampleRows: { type: [Schema.Types.Mixed], default: [] },
    errors: [{ row: Number, phone: String, reason: String }],
  },
  { timestamps: true, suppressReservedKeysWarning: true }
);

// Staging table for validated upload rows between preview and confirm.
// Deleted after a successful confirm - raw uploads are not kept around.
const importRowSchema = new Schema(
  {
    job: { type: Schema.Types.ObjectId, ref: 'ImportJob', required: true, index: true },
    business: { type: Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    row: { type: Number, default: 0 },
    name: { type: String, default: '' },
    phone: { type: String, required: true },
    group: { type: String, default: '' },
    optIn: { type: optInSchema, default: () => ({}) },
    customFields: { type: Map, of: String, default: {} },
  },
  { timestamps: true }
);

// Hard block list: STOP replies and manual opt-outs land here and are checked
// before every send, even if a Contact row still says opted_in.
const suppressionSchema = new Schema(
  {
    business: { type: Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    phone: { type: String, required: true },
    reason: { type: String, default: '' },
    source: { type: String, default: '' }, // "inbound STOP", "dashboard", "import"
  },
  { timestamps: true }
);
suppressionSchema.index({ business: 1, phone: 1 }, { unique: true });

export const Business = model('Business', businessSchema);
export const User = model('User', userSchema);
export const Group = model('Group', groupSchema);
export const Contact = model('Contact', contactSchema);
export const Template = model('Template', templateSchema);
export const Campaign = model('Campaign', campaignSchema);
export const Message = model('Message', messageSchema);
export const ImportJob = model('ImportJob', importJobSchema);
export const ImportRow = model('ImportRow', importRowSchema);
export const Suppression = model('Suppression', suppressionSchema);
