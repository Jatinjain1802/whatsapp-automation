import { ImportJob, ImportRow, Contact, Group, Suppression } from '../models.js';
import { parseImportBuffer } from './excelImport.js';
import { config } from '../config.js';

const yieldToEventLoop = () => new Promise((resolve) => setImmediate(resolve));

// Step 2 of the import pipeline: the parsed + validated rows are staged in the
// importrows collection (batched insertMany), not embedded in the ImportJob
// document. A 100k-row upload would otherwise blow past MongoDB's 16MB
// document limit and make the preview response huge.
export async function createImportPreview({ businessId, filename, buffer, mapping }) {
  const { preview, errors, stats } = parseImportBuffer(buffer, mapping);

  const job = await ImportJob.create({
    business: businessId,
    filename,
    columnMapping: mapping,
    sampleRows: preview.slice(0, 10),
    errors: errors.slice(0, 500),
    stats,
  });

  const batchSize = config.batch.importBatchSize;
  for (let i = 0; i < preview.length; i += batchSize) {
    const slice = preview.slice(i, i + batchSize);
    await ImportRow.insertMany(
      slice.map((r) => ({
        job: job._id,
        business: businessId,
        row: r.row,
        name: r.name,
        phone: r.phone,
        group: r.group,
        optIn: r.optIn,
        customFields: r.customFields,
      })),
      { ordered: false }
    );
    await yieldToEventLoop();
  }

  return { importJobId: job._id, stats, errors: job.errors, sample: job.sampleRows };
}

// Step 3: confirm. Streams staged rows through a cursor and upserts Contacts
// with chunked bulkWrite (unordered - one bad row never blocks the batch).
// Group upserts are cached so each distinct group costs one query total.
export async function confirmImport({ jobId, businessId }) {
  const job = await ImportJob.findOne({ _id: jobId, business: businessId });
  if (!job) {
    const err = new Error('import not found');
    err.status = 404;
    err.expose = true;
    throw err;
  }
  if (job.status === 'confirmed') return { ok: true, already: true, imported: job.stats.imported };

  job.status = 'processing';
  await job.save();

  // The suppression list wins over any consent value in the file.
  const suppressedPhones = new Set(
    (await Suppression.find({ business: businessId }).select('phone').lean()).map((s) => s.phone)
  );
  const groupCache = new Map();
  const batchSize = config.batch.importBatchSize;

  let imported = 0;
  let batch = [];
  try {
    const cursor = ImportRow.find({ job: job._id }).lean().cursor();
    for await (const row of cursor) {
      batch.push(row);
      if (batch.length >= batchSize) {
        imported += await flushBatch(batch, businessId, suppressedPhones, groupCache);
        batch = [];
        await yieldToEventLoop();
      }
    }
    if (batch.length) {
      imported += await flushBatch(batch, businessId, suppressedPhones, groupCache);
    }

    job.status = 'confirmed';
    job.stats.imported = imported;
    await job.save();
    // Staging rows are deleted on success; the import keeps only stats + errors.
    await ImportRow.deleteMany({ job: job._id });
    return { ok: true, imported };
  } catch (err) {
    job.status = 'failed';
    await job.save().catch(() => {});
    throw err;
  }
}

async function flushBatch(rows, businessId, suppressedPhones, groupCache) {
  // Resolve any not-yet-cached group names in this batch (one upsert per name).
  const names = [...new Set(rows.map((r) => r.group).filter(Boolean))];
  for (const name of names) {
    if (groupCache.has(name)) continue;
    const group = await Group.findOneAndUpdate(
      { business: businessId, name },
      { $setOnInsert: { business: businessId, name } },
      { upsert: true, new: true }
    );
    groupCache.set(name, group._id);
  }

  const ops = rows.map((row) => {
    const groupIds = row.group ? [groupCache.get(row.group)] : [];
    // Never resurrect consent for a suppressed number.
    const optIn = suppressedPhones.has(row.phone)
      ? { status: 'opted_out', source: 'suppression list', at: new Date() }
      : row.optIn;

    const update = {
      $set: { name: row.name, optIn, customFields: row.customFields },
      $setOnInsert: { business: businessId, phone: row.phone },
    };
    if (groupIds.length) update.$addToSet = { groups: { $each: groupIds } };

    return {
      updateOne: {
        filter: { business: businessId, phone: row.phone },
        update,
        upsert: true,
      },
    };
  });

  await Contact.bulkWrite(ops, { ordered: false });
  return ops.length;
}
