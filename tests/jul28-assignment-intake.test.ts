import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  ASSIGNMENT_INTAKE_MAX_ROWS,
  ASSIGNMENT_INTAKE_PREVIEW_PAGE_SIZE,
  clearAssignmentRelationshipResolution,
  confirmAssignmentIntakeDraft,
  createAssignmentAttachmentMetadata,
  createAssignmentIntakeDraft,
  getAssignmentFieldAccessibility,
  resolveAssignmentRelationship,
  sliceAssignmentIntakePreview,
  updateAssignmentDraftRecord,
  updateAssignmentDraftSourceLabel,
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

test('labeled paste preserves comma-containing notes and blocks every unparsed clause', async () => {
  const exactNotes = 'Added scope, verify paper before walking';
  const text = [
    `Unit: 602 | Section: A | Trade: Paint | Notes: ${exactNotes}`,
    'Unit: 603 | Section: C | Trade: Clean | B is renewal',
    'Unit: 604 | Section: D | Trade: Paint | Notes: First note | Notes: Second note',
    'Unit: 605, Section: C, Trade: Clean, Crew: Crew Alpha, B is renewal',
  ].join('\n');
  const draft = await createAssignmentIntakeDraft({
    sourceKind: 'paste-text',
    text,
    createdAt,
    draftId: 'intake_unparsed',
  });

  assert.equal(draft.source.originalText, text);
  assert.equal(draft.records[0].notes, exactNotes);
  assert.equal(draft.records[0].reviewState, 'ready-for-confirmation');
  assert.deepEqual(draft.records[1].unparsedWording, ['B is renewal']);
  assert.equal(draft.records[1].reviewState, 'blocked');
  assert.ok(draft.records[1].flags.some((item) => item.code === 'unparsed-wording'));

  const preservedAsNote = updateAssignmentDraftRecord(draft, draft.records[1].id, {
    notesInput: 'B is renewal',
  });
  assert.equal(preservedAsNote.records[1].notes, 'B is renewal');
  assert.equal(preservedAsNote.records[1].reviewState, 'ready-for-confirmation');
  assert.equal(
    preservedAsNote.records[1].flags.some((item) => item.code === 'unparsed-wording'),
    false,
  );
  assert.equal(draft.records[2].reviewState, 'blocked');
  assert.deepEqual(draft.records[2].unparsedWording, ['Notes: Second note']);
  assert.equal(draft.records[3].crewName, 'Crew Alpha');
  assert.deepEqual(draft.records[3].unparsedWording, ['B is renewal']);
  assert.equal(draft.records[3].reviewState, 'blocked');
});

test('duplicates and competing crew claims require an explicit provenance-preserving resolution', async () => {
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
  const resolvedDuplicate = resolveAssignmentRelationship(
    duplicateDraft,
    duplicateDraft.records[0].id,
  );
  assert.equal(resolvedDuplicate.source.originalText, duplicateText);
  assert.equal(resolvedDuplicate.records[0].reviewState, 'ready-for-confirmation');
  assert.equal(resolvedDuplicate.records[0].relationshipResolution?.status, 'supported');
  assert.equal(resolvedDuplicate.records[1].reviewState, 'excluded');
  assert.equal(resolvedDuplicate.records[1].relationshipResolution?.status, 'excluded');

  const reconsideredDuplicate = clearAssignmentRelationshipResolution(
    resolvedDuplicate,
    resolvedDuplicate.records[1].id,
  );
  assert.equal(
    reconsideredDuplicate.records.every((record) => record.reviewState === 'blocked'),
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
  const resolvedConflict = resolveAssignmentRelationship(conflictDraft, conflictDraft.records[1].id);
  assert.equal(resolvedConflict.records[1].relationshipResolution?.issue, 'assignment-conflict');
  assert.equal(resolvedConflict.records[1].reviewState, 'ready-for-confirmation');
  assert.equal(resolvedConflict.records[0].reviewState, 'excluded');

  const expandingText = [
    'Unit,Section,Trade,Crew',
    '602,A,Paint,Crew Alpha',
    '602,A,Paint,Crew Alpha',
    '700,A,Paint,Crew Alpha',
  ].join('\n');
  const expandingDraft = await createAssignmentIntakeDraft({
    sourceKind: 'csv',
    text: expandingText,
    createdAt,
    draftId: 'intake_expanding_relationship',
  });
  const initiallyResolved = resolveAssignmentRelationship(expandingDraft, expandingDraft.records[0].id);
  const expanded = updateAssignmentDraftRecord(initiallyResolved, initiallyResolved.records[2].id, {
    unitInput: '602',
  });
  assert.equal(expanded.records.every((record) => record.relationshipResolution === undefined), true);
  assert.equal(expanded.records.every((record) => record.reviewState === 'blocked'), true);

  const fullyResolved = resolveAssignmentRelationship(expanded, expanded.records[0].id);
  assert.equal(fullyResolved.records[0].relationshipResolution?.relatedRecordIds.length, 2);
  assert.equal(
    fullyResolved.records.filter((record) => record.reviewState === 'excluded').length,
    2,
  );
  const expandedConfirmation = confirmAssignmentIntakeDraft(fullyResolved, {
    recordIds: [fullyResolved.records[0].id],
    confirmedByLos: true,
    confirmedAt: createdAt,
  });
  assert.equal(expandedConfirmation.ok, true);
  if (expandedConfirmation.ok) {
    assert.equal(
      expandedConfirmation.confirmation.records[0].relationshipResolution?.relatedRecordIds.length,
      2,
    );
  }
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
  assert.equal('originalText' in confirmed.confirmation.source, false);
  assert.equal('originalWording' in confirmed.confirmation.records[0], false);
  assert.equal('sourceWordingFingerprint' in confirmed.confirmation.records[0], false);
});

test('confirmation minimizes privacy exposure to selected normalized records and review receipts', async () => {
  const text = [
    'Unit,Section,Trade,Crew,Notes,Tenant Name',
    '602,A,Paint,=HYPERLINK("https://example.invalid"),Needs review,Synthetic Person',
    '603,C,Clean,Crew Beta,Ready,Synthetic Other',
  ].join('\n');
  const original = await createAssignmentIntakeDraft({
    sourceKind: 'csv',
    sourceLabel: 'Synthetic source.csv',
    text,
    createdAt,
    draftId: 'intake_privacy',
  });
  assert.equal(original.records[0].reviewState, 'blocked');
  assert.ok(original.records[0].flags.some((item) => item.code === 'formula-like-value'));

  const corrected = updateAssignmentDraftRecord(original, original.records[0].id, {
    crewInput: 'Crew Alpha',
  });
  assert.equal(corrected.records[0].reviewState, 'ready-for-confirmation');
  const result = confirmAssignmentIntakeDraft(corrected, {
    recordIds: [corrected.records[0].id],
    confirmedByLos: true,
    confirmedAt: createdAt,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const serialized = JSON.stringify(result.confirmation);
  assert.equal(result.confirmation.records.length, 1);
  assert.equal(result.confirmation.records[0].corrections.length, 1);
  assert.deepEqual(result.confirmation.records[0].corrections[0], {
    field: 'crewInput',
    correctedValue: 'Crew Alpha',
  });
  assert.equal(serialized.includes('Synthetic Person'), false);
  assert.equal(serialized.includes('Synthetic Other'), false);
  assert.equal(serialized.includes('https://example.invalid'), false);
  assert.equal(serialized.includes(text), false);
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

test('row limits stop paste and delimited parsing before creating an oversized preview', async () => {
  const pasteRows = Array.from(
    { length: ASSIGNMENT_INTAKE_MAX_ROWS + 1 },
    (_, index) => `Unit: ${index + 1} | Section: A | Trade: Paint`,
  ).join('\n');
  const pasteDraft = await createAssignmentIntakeDraft({
    sourceKind: 'paste-text',
    text: pasteRows,
    createdAt,
    draftId: 'intake_paste_limit',
  });
  assert.equal(pasteDraft.records.length, 0);
  assert.match(pasteDraft.fatalErrors.join(' '), /more than 5,000 rows/);

  const csvRows = [
    'Unit,Section,Trade',
    ...Array.from(
      { length: ASSIGNMENT_INTAKE_MAX_ROWS + 1 },
      (_, index) => `${index + 1},A,Paint`,
    ),
  ].join('\n');
  const csvDraft = await createAssignmentIntakeDraft({
    sourceKind: 'csv',
    text: csvRows,
    createdAt,
    draftId: 'intake_csv_limit',
  });
  assert.equal(csvDraft.records.length, 0);
  assert.match(csvDraft.fatalErrors.join(' '), /more than 5,000 rows/);
});

test('preview pagination bounds iPhone rendering to a small deterministic page', async () => {
  const text = [
    'Unit,Section,Trade',
    ...Array.from({ length: ASSIGNMENT_INTAKE_PREVIEW_PAGE_SIZE + 7 }, (_, index) => `${index + 1},A,Paint`),
  ].join('\n');
  const draft = await createAssignmentIntakeDraft({
    sourceKind: 'csv',
    text,
    createdAt,
    draftId: 'intake_preview_page',
  });
  const first = sliceAssignmentIntakePreview(draft.records, 0);
  const second = sliceAssignmentIntakePreview(draft.records, 1);
  assert.equal(first.length, ASSIGNMENT_INTAKE_PREVIEW_PAGE_SIZE);
  assert.equal(second.length, 7);
  assert.equal(first.at(-1)?.sourceRow, ASSIGNMENT_INTAKE_PREVIEW_PAGE_SIZE + 1);
  assert.equal(second[0]?.sourceRow, ASSIGNMENT_INTAKE_PREVIEW_PAGE_SIZE + 2);
});

test('field accessibility metadata and source-label updates stay tied to the reviewed draft', async () => {
  const original = await createAssignmentIntakeDraft({
    sourceKind: 'paste-text',
    sourceLabel: 'Original label',
    text: 'Unit: 602 | Section: Z | Trade: Paint',
    createdAt,
    draftId: 'intake_accessibility',
  });
  const accessibility = getAssignmentFieldAccessibility(original.records[0], 'sectionInput');
  assert.equal(accessibility.invalid, true);
  assert.equal(accessibility.messages.length, 1);
  assert.match(accessibility.errorId, /sectionInput-errors$/);

  const relabeled = updateAssignmentDraftSourceLabel(original, 'Corrected source label');
  assert.equal(relabeled.source.label, 'Corrected source label');
  assert.equal(relabeled.source.originalText, original.source.originalText);
  assert.equal(original.source.label, 'Original label');

  const panelSource = await readFile(
    new URL('../src/features/jul28-assignment-intake/AssignmentIntakePanel.tsx', import.meta.url),
    'utf8',
  );
  assert.match(panelSource, /aria-label="Choose assignment CSV or TSV file"/);
  assert.match(panelSource, /tabIndex=\{-1\}/);
  assert.match(panelSource, /aria-invalid=/);
  assert.match(panelSource, /aria-describedby=/);
  assert.match(panelSource, /Do not paste or upload tenant names/);
  assert.match(panelSource, /mappingDirty/);
  assert.match(panelSource, /Rebuild preview before confirmation/);
});
