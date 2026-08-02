import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  TRACK_B_CREW_FIELDS,
  TRACK_B_MORE_GROUPS,
  TRACK_B_REPORT_METRICS,
  TRACK_B_SETUP_QUESTIONS,
  validateTrackBCrewDraft,
} from '../src/features/wave2a1-native/track-b/model.ts';

const featureRoot = new URL(
  '../src/features/wave2a1-native/track-b/',
  import.meta.url,
);

const readFeature = (fileName) => readFile(new URL(fileName, featureRoot), 'utf8');

test('More preserves the approved grouped information architecture', () => {
  assert.deepEqual(
    TRACK_B_MORE_GROUPS.map((group) => ({
      label: group.label,
      items: group.items.map((item) => item.label),
    })),
    [
      {
        label: 'Work',
        items: ['Crews', 'Activity', 'Day History', 'Reports and Proof', 'Official PDS Forms', 'Property Portal'],
      },
      {
        label: 'Project',
        items: ['Project Setup', 'Add Today’s Work'],
      },
      {
        label: 'Data and Safety',
        items: ['Backups', 'Sync', 'Privacy', 'Storage'],
      },
      {
        label: 'Account',
        items: ['Profile', 'Sign Out'],
      },
    ],
  );
});
test('Setup exposes one ordered question for each of the 13 approved prompts', () => {
  assert.equal(TRACK_B_SETUP_QUESTIONS.length, 13);
  assert.deepEqual(
    TRACK_B_SETUP_QUESTIONS.map((question) => question.title),
    [
      'Property',
      'Dates',
      'Trades',
      'Contacts',
      'Work hours',
      'Walkthrough time',
      'Unit import',
      'Unit types and sections',
      'Crews',
      'Data and photo permissions',
      'Official forms',
      'Daily goal',
      'Review',
    ],
  );
  assert.equal(new Set(TRACK_B_SETUP_QUESTIONS.map((question) => question.id)).size, 13);
});

test('Crew data stays limited to the approved four fields', () => {
  assert.deepEqual(TRACK_B_CREW_FIELDS, ['name', 'trade', 'phone', 'activeToday']);
  assert.deepEqual(
    validateTrackBCrewDraft({
      activeToday: true,
      name: '',
      phone: undefined,
      trade: 'Paint',
    }),
    { valid: false, errors: ['Name is required.'] },
  );
  assert.equal(
    validateTrackBCrewDraft({
      activeToday: false,
      name: 'José',
      phone: '555-0100',
      trade: 'Clean',
    }).valid,
    true,
  );
});

test('Reports include only the approved recorded-count metrics', () => {
  assert.deepEqual(
    TRACK_B_REPORT_METRICS.map((metric) => metric.label),
    [
      'Units touched',
      'Sections inspected',
      'Working',
      'Waiting',
      'Callbacks found',
      'Callbacks resolved',
      'Ready to walk',
      'Activity count',
    ],
  );
});

test('native shell contracts prevent iPhone zoom and horizontal page movement', async () => {
  const css = await readFeature('trackB.css');

  assert.match(
    css,
    /\.w2a1b-page input:not\(\[type="checkbox"\]\),[\s\S]*?font-size:\s*16px;/,
  );
  assert.match(
    css,
    /\.w2a1b-page button,[\s\S]*?min-block-size:\s*44px;/,
  );
  assert.match(css, /\.w2a1b-page \{[\s\S]*?max-inline-size:\s*100%;/);
  assert.match(css, /\.w2a1b-page \{[\s\S]*?overflow-x:\s*(hidden|clip);/);
  assert.match(css, /@media \(max-width:\s*360px\)/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*no-preference\)/);
});

test('components keep persistence, auth, and proof boundaries explicit', async () => {
  const sources = await Promise.all([
    readFeature('CrewTools.tsx'),
    readFeature('MoreAndProfile.tsx'),
    readFeature('ReportsAndProof.tsx'),
    readFeature('SetupQuestionnaire.tsx'),
  ]);
  const source = sources.join('\n');

  assert.match(source, /does not claim persistence on its own/i);
  assert.match(source, /Preview protection and Turn OS sign-in are separate boundaries/i);
  assert.match(source, /does not create approval,[\s\S]*payroll,[\s\S]*official paper status/i);
  assert.match(source, /Answers remain provisional/i);
  assert.equal(/time saved/i.test(source), false);
  assert.equal(/W-?9|pay rate|tenant|resident data/i.test(source), false);
});
