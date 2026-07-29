import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canConfirmTrackDImport,
  createTrackDSourceBinding,
  isTrackDImportCommitReceipt,
  isTrackDImportDraftCurrent,
  isTrackDSaveReceipt,
  parseTrackDImportText,
  prepareTrackDConfirmedImport,
  trackDSourceBindingsMatch,
} from '../src/features/wave2a2-track-d/model.ts';

const source = (id = 'source-1', kind = 'paste') => ({
  id,
  kind,
  name: `${id}.txt`,
  capturedAt: '2026-07-28T12:00:00.000Z',
});

const provenance = (
  sourceReference,
  originalText,
  revision,
  sourceFiles = [],
) => {
  const { binding } = createTrackDSourceBinding(
    sourceReference,
    revision,
    originalText,
    sourceFiles,
  );
  return {
    source: sourceReference,
    sourceFiles,
    originalText,
    revision,
    fingerprint: binding.fingerprint,
  };
};

const parseBound = async ({
  text = '101',
  sourceReference = source(),
  revision = 1,
  sourceFiles = [],
  kind = 'property-roster',
  existingUnitNumbers = [],
} = {}) => {
  const currentProvenance = provenance(
    sourceReference,
    text,
    revision,
    sourceFiles,
  );
  const draft = await parseTrackDImportText(text, {
    existingUnitNumbers,
    kind,
    source: sourceReference,
    sourceFiles,
    sourceRevision: revision,
  });
  return { draft, provenance: currentProvenance };
};

test('01 source edited after parsing cannot be confirmed', async () => {
  const parsed = await parseBound({ text: '101', revision: 1 });
  const edited = provenance(parsed.provenance.source, '102', 2);

  assert.equal(isTrackDImportDraftCurrent(parsed.draft, edited), false);
  assert.equal(canConfirmTrackDImport(parsed.draft, edited), false);
  assert.equal(
    prepareTrackDConfirmedImport(parsed.draft, edited),
    null,
  );
});

test('02 replacing a source invalidates a slower earlier source result', async () => {
  const earlier = await parseBound({
    text: '101',
    sourceReference: source('earlier'),
  });
  const replacement = await parseBound({
    text: '102',
    sourceReference: source('replacement'),
  });

  assert.equal(
    isTrackDImportDraftCurrent(
      earlier.draft,
      replacement.provenance,
    ),
    false,
  );
  assert.equal(
    isTrackDImportDraftCurrent(
      replacement.draft,
      replacement.provenance,
    ),
    true,
  );
});

test('03 an older result for the same source revision cannot overwrite a newer revision', async () => {
  const sourceReference = source('revisioned');
  const older = await parseBound({
    text: '101',
    sourceReference,
    revision: 1,
  });
  const newer = await parseBound({
    text: '102',
    sourceReference,
    revision: 2,
  });

  assert.equal(
    isTrackDImportDraftCurrent(older.draft, newer.provenance),
    false,
  );
  assert.equal(
    isTrackDImportDraftCurrent(newer.draft, newer.provenance),
    true,
  );
});

test('04 reopening a stale saved draft fails the source-binding check', async () => {
  const parsed = await parseBound({ text: '101', revision: 7 });
  const reopenedAgainstNewerSource = provenance(
    parsed.provenance.source,
    '101\n102',
    8,
  );

  assert.equal(
    prepareTrackDConfirmedImport(
      structuredClone(parsed.draft),
      reopenedAgainstNewerSource,
    ),
    null,
  );
});

test('05 empty source remains exact and cannot save', async () => {
  const parsed = await parseBound({ text: '' });

  assert.equal(parsed.draft.originalSource.originalText, '');
  assert.deepEqual(parsed.draft.rows, []);
  assert.equal(canConfirmTrackDImport(parsed.draft, parsed.provenance), false);
});

test('06 malformed pasted text is validation-blocked', async () => {
  const parsed = await parseBound({ text: 'not a unit identifier' });

  assert.match(
    parsed.draft.rows[0].conflicts.join(' '),
    /format needs review/,
  );
  assert.equal(canConfirmTrackDImport(parsed.draft, parsed.provenance), false);
});

test('07 a partial CSV row is conflict-blocked', async () => {
  const parsed = await parseBound({
    text: 'Unit,Paint,Clean\n101,yes',
  });

  assert.match(
    parsed.draft.rows[0].conflicts.join(' '),
    /2 columns; expected 3/,
  );
  assert.equal(canConfirmTrackDImport(parsed.draft, parsed.provenance), false);
});

test('08 duplicate Units are blocked', async () => {
  const parsed = await parseBound({ text: '101\n101' });

  assert.ok(
    parsed.draft.rows.every((row) =>
      row.conflicts.includes('Duplicate Unit in this source.'),
    ),
  );
  assert.equal(canConfirmTrackDImport(parsed.draft, parsed.provenance), false);
});

test('09 duplicate Unit section and trade combinations are blocked', async () => {
  const parsed = await parseBound({
    text: [
      'Unit,Unit Type,Sections,Paint,Clean',
      '101,2,"A,B",yes,no',
      '101,2,"A,B",yes,no',
    ].join('\n'),
  });

  assert.ok(
    parsed.draft.rows.every((row) =>
      row.conflicts.includes('Duplicate Unit in this source.'),
    ),
  );
  assert.equal(prepareTrackDConfirmedImport(
    parsed.draft,
    parsed.provenance,
  ), null);
});

test('10 contradictory Paint and Clean scope columns are blocked', async () => {
  const parsed = await parseBound({
    text: [
      'Unit,Paint,Paint,Clean,Clean',
      '101,yes,no,yes,no',
    ].join('\n'),
  });

  assert.match(
    parsed.draft.rows[0].conflicts.join(' '),
    /Conflicting Paint scope/,
  );
  assert.match(
    parsed.draft.rows[0].conflicts.join(' '),
    /Conflicting Clean scope/,
  );
  assert.equal(canConfirmTrackDImport(parsed.draft, parsed.provenance), false);
});

test('11 a room letter outside the numeric Unit type is blocked', async () => {
  const parsed = await parseBound({
    text: 'Unit,Unit Type,Sections\n101,2,"A,C"',
  });

  assert.match(
    parsed.draft.rows[0].conflicts.join(' '),
    /Section C is not valid for Unit type 2/,
  );
});

test('12 unsupported trade columns block confirmation', async () => {
  const parsed = await parseBound({
    text: 'Unit,Trade,Paint\n101,Carpet,yes',
  });

  assert.match(parsed.draft.warnings.join(' '), /Paint and Clean scope only/);
  assert.equal(canConfirmTrackDImport(parsed.draft, parsed.provenance), false);
});

test('13 unresolved parser uncertainty blocks confirmation', async () => {
  const parsed = await parseBound({
    text: 'Unit: 101; paint: perhaps',
  });

  assert.match(
    parsed.draft.rows[0].uncertainties.join(' '),
    /needs review/,
  );
  assert.equal(canConfirmTrackDImport(parsed.draft, parsed.provenance), false);
});

test('19 original pasted and CSV text remains code-unit equivalent after parsing', async () => {
  const exact = '\uFEFFUnit,Paint,Restrictions\r\n101,yes,"  keep, commas  "\r\n';
  const parsed = await parseBound({ text: exact });

  assert.equal(parsed.draft.originalSource.originalText, exact);
  assert.equal(parsed.provenance.originalText, exact);
});

test('19 original CSV File bytes and metadata remain attached to confirmation', async () => {
  const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x31, 0x30, 0x31, 0x0a]);
  const file = new File([bytes], 'release.csv', {
    lastModified: 123456789,
    type: 'text/csv',
  });
  const parsed = await parseBound({
    text: '101\n',
    sourceReference: {
      ...source('csv-file', 'file'),
      name: file.name,
      mimeType: file.type,
      byteSize: file.size,
    },
    sourceFiles: [file],
  });
  const confirmed = prepareTrackDConfirmedImport(
    parsed.draft,
    parsed.provenance,
  );

  assert.ok(confirmed);
  assert.strictEqual(confirmed.sourceFiles[0], file);
  assert.deepEqual(
    new Uint8Array(await confirmed.sourceFiles[0].arrayBuffer()),
    bytes,
  );
  assert.deepEqual(confirmed.originalSource.files[0], {
    name: 'release.csv',
    mimeType: 'text/csv',
    byteSize: bytes.byteLength,
    lastModified: 123456789,
  });
});

test('20 normalized fields never mutate the exact original source', async () => {
  const exact =
    '  Unit: 101 ; sections: a, COMMON ; paint: YES ; notes:  Keep spaces  \r\n';
  const parsed = await parseBound({ text: exact });
  const originalBeforeCorrection = parsed.draft.originalSource;
  const corrected = {
    ...parsed.draft,
    rows: [
      {
        ...parsed.draft.rows[0],
        unitNumber: 'UNIT-101-CORRECTED',
        restrictions: 'Corrected structured value',
      },
    ],
  };

  assert.strictEqual(corrected.originalSource, originalBeforeCorrection);
  assert.equal(corrected.originalSource.originalText, exact);
  assert.equal(corrected.rows[0].sourceExcerpt, exact.replace(/\r\n$/, ''));
});

test('21 formula-like CSV cells remain inert untrusted text', async () => {
  const formula = '=HYPERLINK("https://invalid.example","open")';
  const exact = `Unit,Paint,Restrictions\n101,yes,"${formula.replaceAll('"', '""')}"`;
  const parsed = await parseBound({ text: exact });

  assert.equal(parsed.draft.rows[0].restrictions, formula);
  assert.equal(parsed.draft.originalSource.originalText, exact);
  assert.doesNotMatch(parsed.draft.rows[0].restrictions, /^https?:/);
});

test('22 rejected preparation returns no operational records', async () => {
  const parsed = await parseBound({ text: '101\n101' });
  const operationalRecords = [];
  const prepared = prepareTrackDConfirmedImport(
    parsed.draft,
    parsed.provenance,
  );
  if (prepared) operationalRecords.push(...prepared.rows);

  assert.equal(prepared, null);
  assert.deepEqual(operationalRecords, []);
});

test('23 success is recognized only from a complete matching commit receipt', async () => {
  const parsed = await parseBound({ text: '101' });
  const confirmed = prepareTrackDConfirmedImport(
    parsed.draft,
    parsed.provenance,
  );
  assert.ok(confirmed);

  assert.equal(
    isTrackDImportCommitReceipt(
      { committed: true, sourceBinding: confirmed.sourceBinding },
      confirmed.sourceBinding,
    ),
    true,
  );
  assert.equal(
    isTrackDImportCommitReceipt(
      {
        committed: true,
        sourceBinding: { ...confirmed.sourceBinding, revision: 99 },
      },
      confirmed.sourceBinding,
    ),
    false,
  );
  assert.equal(isTrackDSaveReceipt({ recordId: '', message: 'Saved' }), false);
  assert.equal(
    isTrackDSaveReceipt({ recordId: 'record-1', message: 'Saved' }),
    true,
  );
});

test('24 rejected import leaves neighboring notes photos roster and releases unchanged', async () => {
  const state = {
    notes: [{ id: 'note-1', wording: 'unchanged' }],
    photos: [{ id: 'photo-1', caption: 'unchanged' }],
    roster: [{ unitNumber: '100' }],
    releases: [{ unitNumber: '100', date: '2026-07-28' }],
  };
  const before = structuredClone(state);
  const parsed = await parseBound({ text: '101\n101' });
  const prepared = prepareTrackDConfirmedImport(
    parsed.draft,
    parsed.provenance,
    state.roster.map((row) => row.unitNumber),
  );
  if (prepared) state.roster.push(...prepared.rows);

  assert.equal(prepared, null);
  assert.deepEqual(state, before);
});

test('source binding comparison requires identity revision and fingerprint', () => {
  const reference = source('binding');
  const first = createTrackDSourceBinding(reference, 1, '101').binding;
  const same = createTrackDSourceBinding(reference, 1, '101').binding;
  const changed = createTrackDSourceBinding(reference, 2, '102').binding;

  assert.equal(trackDSourceBindingsMatch(first, same), true);
  assert.equal(trackDSourceBindingsMatch(first, changed), false);
});
