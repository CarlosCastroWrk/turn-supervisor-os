import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalIntegerDraft, integerValueFromDraft, sanitizeIntegerDraft } from '../src/lib/numberInput';

test('integer number input canonicalizes leading-zero setup drafts', () => {
  assert.equal(integerValueFromDraft('020', { min: 0 }), 20);
  assert.equal(canonicalIntegerDraft('020', { min: 0 }), '20');
  assert.equal(integerValueFromDraft('08', { min: 0 }), 8);
  assert.equal(canonicalIntegerDraft('08', { min: 0 }), '8');
});

test('integer number input preserves a safe value for blank drafts', () => {
  assert.equal(integerValueFromDraft('', { min: 0 }), 0);
  assert.equal(canonicalIntegerDraft('', { min: 0 }), '0');
  assert.equal(integerValueFromDraft('', { min: 1 }), 1);
  assert.equal(canonicalIntegerDraft('', { min: 1 }), '1');
});

test('integer number input keeps only numeric characters from pasted values', () => {
  assert.equal(sanitizeIntegerDraft(' 20 units'), '20');
  assert.equal(integerValueFromDraft('5 beds', { min: 0, max: 4 }), 4);
});
