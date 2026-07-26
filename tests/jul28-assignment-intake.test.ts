import assert from 'node:assert/strict';
import test from 'node:test';
import {
  confirmAssignmentIntakeDraft,
  createAssignmentAttachmentMetadata,
  createAssignmentIntakeDraft,
  updateAssignmentDraftRecord,
} from '../src/features/jul28-assignment-intake/assignmentIntake.ts';

const createdAt = '2026-07-28T12:00:00.000Z';

test('CSV intake preserves the exact source and remains a non-persisting draft before confirmation', async () => {
  const text = [
    'Unit,Section,Trade,Crew,Notes',
    '602,Common,Paint,Crew Alpha,"Added scope, verify paper"',
    '603,C,Clean,Crew Beta,Resident access window',
  ].join('\n');
  const draft = await createAssignmentIntakeDraft({
    sourceKind: 'csv',
    sourceLabel: 'Synthetic assignment export.csv',
    text,
    createdAt,
    draftId: 'intake_csv_safe',
  });

  assert.equal(draft.status, 'draft');
  assert.equal(draft.writesToAppData, false);
  assert.equal(draft.explicitConfirmationRequired, true);
  assert.equal(draft.source.originalText, text);
  assert.equal(draft.source.paperRemainsAuthoritative, true);
  assert.equal(draft.records[0].originalWording, '602,Common,Paint,Crew Alpha,"Added scope, verify paper"\n');
  assert.equal(draft.records[1].originalWording, '603,C,Clean,Crew Beta,Resident access window');
  assert.deepEqual(draft.mapping, { unit: 0, section: 1, trade: 2, crew: 3, notes: 4 });
  assert.equal(draft.records.length, 2);
  assert.deepEqual(
    draft.records.map((record) => [record.unitNumber, record.section, record.trade, record.confirmationState]),
    [
      ['602', 'Common', 'Paint', 'not-confirmed'],
      ['603', 'C', 'Clean', 'not-confirmed'],
    ],
  );
});

test('tab-delimited Excel-compatible input supports column mapping without an xlsx package', async () => {
  const text = [
    'Apartment\tRoom\tService\tAssigned Team',
    '604\tC\tPainting\tCrew Alpha',
    '1305\tB\tCleaning\tCrew Beta',
  ].join('\n');
  const draft = await createAssignmentIntakeDraft({
    sourceKind: 'excel-compatible',
    sourceLabel: 'Synthetic Excel paste',
    text,
    mapping: { unit: 0, section: 1, trade: 2, crew: 3 },
    createdAt,
    draftId: 'intake_tsv_safe',
  });

  assert.equal(draft.delimiter, '\t');
  assert.equal(draft.fatalErrors.length, 0);
  assert.deepEqual(
    draft.records.map((record) => [record.unitNumber, record.section, record.trade, record.crewName]),
    [
      ['604', 'C', 'Paint', 'Crew Alpha'],
      ['1305', 'B', 'Clean', 'Crew Beta'],
    ],
  );
});

test('manual mapping can explicitly reject an unsafe automatic suggestion', async () => {
  const text = ['Unit,Section,Trade', '602,A,Paint'].join('\n');
  const draft = await createAssignmentIntakeDraft({
    sourceKind: 'csv',
    text,
    mapping: { trade: null },
    createdAt,
    draftId: 'intake_unmap',
  });

  assert.equal(draft.mapping.trade, undefined);
  assert.equal(draft.records.length, 0);
  assert.match(draft.fatalErrors.join(' '), /Map the required trade column/);
});

test('paste-text intake accepts labeled lines and retains every original line', async () => {
  const text = [
    'Unit: 602 | Section: Common | Trade: Paint | Crew: Crew Alpha',
    'Unit: 603 | Section: C | Trade: Clean | Notes: Access check first',
  ].join('\n');
  const draft = await createAssignmentIntakeDraft({
    sourceKind: 'paste-text',
    text,
    createdAt,
    draftId: 'intake_paste_safe',
  });

  assert.equal(draft.fatalErrors.length, 0);
  assert.equal(draft.records.length, 2);
  assert.equal(draft.records[0].originalWording, text.split('\n')[0]);
  assert.equal(draft.records[1].originalWording, text.split('\n')[1]);
  assert.equal(draft.records.every((record) => record.reviewState === 'ready-for-confirmation'), true);
});

test('duplicates and competing crew claims stay visible and blocked', async () => {
  const duplicateText = [
    'Unit,Section,Trade,Crew',
    '602,A,Paint,Crew Alpha',
    '602,A,Paint,Crew Alpha',
  ].join('\n');
  const duplicateDraft = await createAssignmentIntakeDraft({
    sourceKind: 'csv',
    text: duplicateText,
    createdAt,
    draftId: 'intake_duplicate',
  });
  assert.equal(duplicateDraft.records.length, 2);
  assert.equal(
    duplicateDraft.records.every((record) =>
      record.flags.some((item) => item.code === 'duplicate-assignment' && item.severity === 'blocking'),
    ),
    true,
  );

  const conflictText = [
    'Unit,Section,Trade,Crew',
    '604,C,Clean,Crew Alpha',
    '604,C,Clean,Crew Beta',
  ].join('\n');
  const conflictDraft = await createAssignmentIntakeDraft({
    sourceKind: 'csv',
    text: conflictText,
    createdAt,
    draftId: 'intake_conflict',
  });
  assert.equal(
    conflictDraft.records.every((record) =>
      record.flags.some((item) => item.code === 'assignment-conflict' && item.severity === 'blocking'),
    ),
    true,
  );
});

test('manual correction clears supported unknowns without changing the raw source', async () => {
  const text = 'Unit: 604 | Section: Z | Trade: Carpet | Crew: Crew Alpha';
  const original = await createAssignmentIntakeDraft({
    sourceKind: 'paste-text',
    text,
    createdAt,
    draftId: 'intake_manual_fix',
  });
  assert.equal(original.records[0].reviewState, 'blocked');
  assert.ok(original.records[0].flags.some((item) => item.code === 'unknown-section'));
  assert.ok(original.records[0].flags.some((item) => item.code === 'unknown-trade'));

  const corrected = updateAssignmentDraftRecord(original, original.records[0].id, {
    sectionInput: 'C',
    tradeInput: 'Clean',
  });
  assert.equal(corrected.status, 'draft');
  assert.equal(corrected.source.originalText, text);
  assert.equal(corrected.records[0].originalWording, text);
  assert.equal(corrected.records[0].section, 'C');
  assert.equal(corrected.records[0].trade, 'Clean');
  assert.equal(corrected.records[0].reviewState, 'ready-for-confirmation');
  assert.equal(corrected.records[0].corrections.length, 2);
});

test('explicit Los confirmation is the only boundary and never writes AppData', async () => {
  const draft = await createAssignmentIntakeDraft({
    sourceKind: 'paste-text',
    text: 'Unit: 1305 | Section: B | Trade: Paint | Crew: Crew Alpha',
    createdAt,
    draftId: 'intake_confirmation',
  });
  const recordId = draft.records[0].id;

  const notConfirmed = confirmAssignmentIntakeDraft(draft, {
    recordIds: [recordId],
    confirmedByLos: false,
    confirmedAt: createdAt,
  });
  assert.equal(notConfirmed.ok, false);
  if (!notConfirmed.ok) assert.match(notConfirmed.errors.join(' '), /explicitly confirm/);

  const confirmed = confirmAssignmentIntakeDraft(draft, {
    recordIds: [recordId],
    confirmedByLos: true,
    confirmedAt: createdAt,
  });
  assert.equal(confirmed.ok, true);
  if (!confirmed.ok) return;
  assert.equal(confirmed.confirmation.scope, 'personal-candidate-only');
  assert.equal(confirmed.confirmation.paperRemainsAuthoritative, true);
  assert.equal(confirmed.confirmation.writesToAppData, false);
  assert.equal(confirmed.confirmation.records[0].unitNumber, '1305');
  assert.equal(confirmed.confirmation.source.originalText, draft.source.originalText);
});

test('invalid, unknown, duplicate, and conflicting records cannot cross confirmation', async () => {
  const draft = await createAssignmentIntakeDraft({
    sourceKind: 'paste-text',
    text: [
      'Unit: 602 | Section: Z | Trade: Paint',
      'Unit: 603 | Section: C | Trade: Repair',
      'Unit: 604 | Section: C | Trade: Clean | Crew: Crew Alpha',
      'Unit: 604 | Section: C | Trade: Clean | Crew: Crew Beta',
    ].join('\n'),
    createdAt,
    draftId: 'intake_blocked',
  });
  const result = confirmAssignmentIntakeDraft(draft, {
    recordIds: draft.records.map((record) => record.id),
    confirmedByLos: true,
    confirmedAt: createdAt,
  });

  assert.equal(result.ok, false);
  assert.equal(draft.records.every((record) => record.confirmationState === 'not-confirmed'), true);
  if (!result.ok) assert.match(result.errors.join(' '), /blocked/);
});

test('attachment contract retains metadata only and marks contents as non-persisted', () => {
  const metadata = createAssignmentAttachmentMetadata({
    name: 'synthetic-assignments.csv',
    type: 'text/csv',
    size: 128,
    lastModified: 1_784_912_400_000,
  });

  assert.deepEqual(metadata, {
    name: 'synthetic-assignments.csv',
    mediaType: 'text/csv',
    sizeBytes: 128,
    lastModified: 1_784_912_400_000,
    referenceOnly: true,
    contentsPersisted: false,
  });
  assert.equal('bytes' in metadata, false);
  assert.equal('path' in metadata, false);
});
