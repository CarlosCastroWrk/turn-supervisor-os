import assert from 'node:assert/strict';
import test from 'node:test';
import { crewCallbackTextBody } from '../src/features/wave2a2-track-c/crewTextTemplates.ts';

// When Joseph calls back a room, the crew that DID it gets a "come back and fix
// it" text with what's wrong in each room.
test('callback text lists rooms with the reason per room', () => {
  const body = crewCallbackTextBody('Rocky', 'en', [
    { unitNumber: '1104', sections: [
      { label: 'A', reason: 'touch-up needs a redo' },
      { label: 'B', reason: 'better look at the cut-in' },
    ] },
  ]);
  assert.match(body, /Rocky/);
  assert.match(body, /Unit 1104: A — touch-up needs a redo, B — better look at the cut-in/);
});

test('common area reads as common area; rooms with no reason still list', () => {
  const en = crewCallbackTextBody('Sandra', 'en', [
    { unitNumber: '507', sections: [{ label: 'common' }] },
  ]);
  assert.match(en, /Unit 507: common area/);
  const es = crewCallbackTextBody('Sandra', 'es', [
    { unitNumber: '507', sections: [{ label: 'common', reason: 'falta pintar' }] },
  ]);
  assert.match(es, /área común — falta pintar/);
});

test('multiple units are sorted top-floor-first', () => {
  const body = crewCallbackTextBody('Rocky', 'en', [
    { unitNumber: '301', sections: [{ label: 'A' }] },
    { unitNumber: '1806', sections: [{ label: 'B' }] },
  ]);
  const idx1806 = body.indexOf('1806');
  const idx301 = body.indexOf('301');
  assert.ok(idx1806 < idx301, 'higher floor (1806) comes before 301');
});
