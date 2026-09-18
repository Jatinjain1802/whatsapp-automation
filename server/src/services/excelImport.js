import xlsx from 'xlsx';
import { normalizePhone } from '../utils/phone.js';

// Parse an uploaded .xlsx/.csv buffer into normalized preview rows.
// Expected columns after mapping: name, phone, group, consentStatus,
// consentAt, consentSource, plus any custom fields the business mapped.
export function parseImportBuffer(buffer, mapping, defaultCountry = 'IN') {
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

  const seen = new Set();
  const preview = [];
  const errors = [];
  let duplicates = 0;
  let invalid = 0;

  rows.forEach((row, i) => {
    const rowNumber = i + 2; // header is row 1
    const rawPhone = row[mapping.phone];
    const phone = normalizePhone(rawPhone, defaultCountry);

    if (!phone) {
      invalid += 1;
      errors.push({ row: rowNumber, phone: String(rawPhone ?? ''), reason: 'invalid phone number' });
      return;
    }
    if (seen.has(phone)) {
      duplicates += 1;
      errors.push({ row: rowNumber, phone, reason: 'duplicate in file' });
      return;
    }
    seen.add(phone);

    const consentRaw = String(row[mapping.consentStatus] ?? '').trim().toLowerCase();
    const optIn = {
      status: ['yes', 'true', '1', 'opted_in', 'opted-in'].includes(consentRaw) ? 'opted_in' : 'unknown',
      source: mapping.consentSource ? String(row[mapping.consentSource] ?? '') : 'excel import',
      at: mapping.consentAt && row[mapping.consentAt] ? new Date(row[mapping.consentAt]) : undefined,
    };

    const customFields = {};
    for (const [excelCol, fieldKey] of Object.entries(mapping.customFields || {})) {
      if (row[excelCol] !== undefined && row[excelCol] !== '') customFields[fieldKey] = String(row[excelCol]);
    }

    preview.push({
      row: rowNumber,
      name: mapping.name ? String(row[mapping.name] ?? '').trim() : '',
      phone,
      group: mapping.group ? String(row[mapping.group] ?? '').trim() : '',
      optIn,
      customFields,
    });
  });

  return {
    preview,
    errors,
    stats: { totalRows: rows.length, valid: preview.length, duplicates, invalid },
  };
}

// Return just the header row so the UI can render the column-mapping screen.
export function readImportHeaders(buffer) {
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  return rows[0] || [];
}
