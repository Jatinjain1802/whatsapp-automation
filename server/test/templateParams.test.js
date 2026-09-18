import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTemplateParams, resolvePath } from '../src/services/templateParams.js';

const contact = {
  name: 'Asha',
  phone: '+919876543210',
  customFields: { orderId: 'ORD-1', amount: '499' },
};

test('plain-object mapping resolves in numeric order', () => {
  const params = buildTemplateParams({ 2: 'customFields.orderId', 1: 'name' }, contact);
  assert.deepEqual(params, ['Asha', 'ORD-1']);
});

test('JS Map mapping works (mongoose Maps are Map subclasses)', () => {
  const mapping = new Map([
    ['1', 'name'],
    ['2', 'customFields.amount'],
  ]);
  assert.deepEqual(buildTemplateParams(mapping, contact), ['Asha', '499']);
});

test('contact customFields may itself be a Map', () => {
  const c = { name: 'Asha', customFields: new Map([['orderId', 'ORD-9']]) };
  assert.equal(resolvePath(c, 'customFields.orderId'), 'ORD-9');
});

test('missing values resolve to empty string, never undefined', () => {
  assert.equal(resolvePath(contact, 'customFields.missing'), '');
  assert.equal(resolvePath(contact, 'missingField'), '');
  assert.equal(resolvePath(contact, ''), '');
  assert.deepEqual(buildTemplateParams(null, contact), []);
});
