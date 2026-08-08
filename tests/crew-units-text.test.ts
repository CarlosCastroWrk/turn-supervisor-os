import assert from 'node:assert/strict';
import test from 'node:test';
import { crewUnitsTextBody } from '../src/features/wave2a2-track-c/crewTextTemplates.ts';

// Los's crew lists go out in an exact WhatsApp format (from his real sends,
// Aug 8). Paint shows "room: task" per room with his words (retoque/recorte/
// completo); clean lists the rooms with no task ("Común + A, B, C, D"); a
// studio clean reads just "Estudio". Greeting names the crew; the closing is
// fixed. This pins that format so the send-queue always matches the board.

test('paint list uses room: task with Los\'s Spanish words, top-floor-first', () => {
  const body = crewUnitsTextBody('Rocky', 'es', [
    { sections: [{ bed: 'C', kind: 'bed', workType: 'cut-in' }], unitNumber: '1101' },
    {
      sections: [
        { bed: 'A', kind: 'bed', workType: 'cut-in' },
        { bed: 'D', kind: 'bed', workType: 'touch-up' },
      ],
      unitNumber: '1002',
    },
  ], 'paint');
  assert.match(body, /^Buenos días, Rocky\. Estas son tus unidades para hoy:/);
  assert.match(body, /1101 — C: recorte/);
  assert.match(body, /1002 — A: recorte, D: retoque/);
  assert.match(body, /Por favor, mantenme al tanto cuando termines cada unidad y pases a la siguiente\. Gracias\.$/);
  // top-floor-first: 1101 comes before 1002
  assert.ok(body.indexOf('1101') < body.indexOf('1002'));
});

test('full paint room reads "completo"; combos join with +', () => {
  const body = crewUnitsTextBody('Rocky', 'es', [
    {
      sections: [
        { bed: 'A', kind: 'bed', workType: 'full' },
        { bed: 'B', kind: 'bed', workType: 'full-cut-in' },
      ],
      unitNumber: '1606',
    },
  ], 'paint');
  assert.match(body, /1606 — A: completo, B: completo \+ recorte/);
});

test('clean list shows Común + rooms, no task words', () => {
  const body = crewUnitsTextBody('Paola', 'es', [
    {
      sections: [
        { kind: 'common' },
        { bed: 'A', kind: 'bed' },
        { bed: 'B', kind: 'bed' },
        { bed: 'C', kind: 'bed' },
        { bed: 'D', kind: 'bed' },
      ],
      unitNumber: '1404',
    },
  ], 'clean');
  assert.match(body, /1404 — Común \+ A, B, C, D/);
  assert.doesNotMatch(body, /recorte|retoque|completo/);
});

test('studio clean reads just Estudio', () => {
  const body = crewUnitsTextBody('Paola', 'es', [
    { isStudio: true, sections: [{ kind: 'common' }], unitNumber: '1209' },
  ], 'clean');
  assert.match(body, /1209 — Estudio/);
});

test('English variant keeps the same structure', () => {
  const body = crewUnitsTextBody('Rocky', 'en', [
    { sections: [{ bed: 'C', kind: 'bed', workType: 'cut-in' }], unitNumber: '1101' },
  ], 'paint');
  assert.match(body, /^Good morning, Rocky\. These are your units for today:/);
  assert.match(body, /1101 — C: cut-in/);
  assert.match(body, /Please keep me posted/);
});
