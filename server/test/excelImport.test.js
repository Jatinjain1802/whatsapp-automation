import test from 'node:test';
import assert from 'node:assert/strict';
import xlsx from 'xlsx';
import { parseImportBuffer, readImportHeaders } from '../src/services/excelImport.js';

function makeBuffer(rows) {
  const ws = xlsx.utils.aoa_to_sheet(rows);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'Sheet1');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

const HEADER = ['Name', 'Mobile', 'City', 'Consent', 'OrderID'];
const MAPPING = {
  name: 'Name',
  phone: 'Mobile',
  group: 'City',
  consentStatus: 'Consent',
  customFields: { OrderID: 'orderId' },
};

test('headers come back from the first row', () => {
  const buf = makeBuffer([HEADER, ['Asha', '9876543210', 'Pune', 'yes', 'O1']]);
  assert.deepEqual(readImportHeaders(buf), HEADER);
});

test('valid rows are normalized, duplicates and invalid rows are counted', () => {
  const buf = makeBuffer([
    HEADER,
    ['Asha', '9876543210', 'Pune', 'yes', 'O1'],
    ['Asha Duplicate', '+91 98765 43210', 'Pune', 'yes', 'O2'], // same number
    ['Bad', '123', 'Pune', 'yes', 'O3'],
    ['Rahul', '9812345678', 'Indore', 'no', 'O4'],
  ]);
  const { preview, errors, stats } = parseImportBuffer(buf, MAPPING);

  assert.equal(stats.totalRows, 4);
  assert.equal(stats.valid, 2);
  assert.equal(stats.duplicates, 1);
  assert.equal(stats.invalid, 1);
  assert.equal(errors.length, 2);

  const asha = preview.find((r) => r.name === 'Asha');
  assert.equal(asha.phone, '+919876543210');
  assert.equal(asha.group, 'Pune');
  assert.equal(asha.optIn.status, 'opted_in');
  assert.equal(asha.customFields.orderId, 'O1');

  // "no" consent must never become opted_in.
  const rahul = preview.find((r) => r.name === 'Rahul');
  assert.equal(rahul.optIn.status, 'unknown');
});
