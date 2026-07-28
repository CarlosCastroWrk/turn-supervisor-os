import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildTrackDReportMetrics,
  canConfirmTrackDImport,
  createUnavailableExtractionDraft,
  displayPermissionValue,
  filterTrackDActivity,
  parseTrackDImportText,
  projectLegacyActivityRecord,
  resolveTrackDImportProvenance,
  revalidateTrackDImportRows,
  TRACK_D_MORE_GROUPS,
  TRACK_D_OFFICIAL_FORMS,
} from '../src/features/wave2a2-track-d/model.ts';
import {
  projectTrackDActivityFromAppData,
  selectTrackDProfileSummary,
  selectTrackDUnitOptions,
} from '../src/features/wave2a2-track-d/appDataProjection.ts';

const source = {
  id: 'source-1',
  kind: 'paste',
  name: 'Synthetic source',
  capturedAt: '2026-07-28T12:00:00.000Z',
};

test('deterministic CSV parsing preserves source rows and explicit Paint/Clean scope', async () => {
  const draft = await parseTrackDImportText(
    [
      'Unit,Unit Type,Building,Floor,Sections,Paint,Clean,Restrictions',
      '413,4,4,4,"Common,A,C,D",yes,no,B renewal',
      '416,2,4,4,"Common,A,B",required,needed,',
    ].join('\n'),
    {
      existingUnitNumbers: ['413', '416'],
      kind: 'daily-release',
      source,
    },
  );

  assert.equal(draft.rows.length, 2);
  assert.deepEqual(draft.rows[0].applicableSections, [
    'Common',
    'A',
    'C',
    'D',
  ]);
  assert.equal(draft.rows[0].paintRequested, true);
  assert.equal(draft.rows[0].cleanRequested, false);
  assert.equal(draft.rows[0].sourceExcerpt.includes('413'), true);
  assert.equal(canConfirmTrackDImport(draft), true);
});

test('manual parsing uses explicit labels and surfaces unlabeled uncertainty', async () => {
  const draft = await parseTrackDImportText(
    'Unit: 420; sections: A, D; paint: yes; unknown: inspect later\n421; extra wording',
    {
      kind: 'property-roster',
      source: { ...source, kind: 'manual' },
    },
  );

  assert.equal(draft.rows[0].unitNumber, '420');
  assert.deepEqual(draft.rows[0].applicableSections, ['A', 'D']);
  assert.equal(draft.rows[0].paintRequested, true);
  assert.match(draft.rows[0].uncertainties.join(' '), /Unrecognized label/);
  assert.match(draft.rows[1].uncertainties.join(' '), /Unlabeled text/);
});

test('property roster blocks existing duplicates while preserving duplicate and missing conflicts', async () => {
  const draft = await parseTrackDImportText('101\n101\n202\nUnit:', {
    existingUnitNumbers: ['202'],
    kind: 'property-roster',
    source,
  });

  assert.equal(canConfirmTrackDImport(draft), false);
  assert.match(draft.rows[0].conflicts.join(' '), /Duplicate Unit/);
  assert.match(draft.rows[2].conflicts.join(' '), /already exists/);
  assert.match(draft.rows[3].conflicts.join(' '), /required/);
});

test('daily release accepts known roster Units and explicitly blocks unknown, duplicate, and missing Units', async () => {
  const draft = await parseTrackDImportText('101\n102\n999\n102\nUnit:', {
    existingUnitNumbers: ['101', '102'],
    kind: 'daily-release',
    source,
  });

  assert.deepEqual(draft.rows[0].conflicts, []);
  assert.match(draft.rows[1].conflicts.join(' '), /Duplicate Unit/);
  assert.match(draft.rows[2].conflicts.join(' '), /not in the supplied property roster/);
  assert.match(draft.rows[4].conflicts.join(' '), /required/);
  assert.equal(canConfirmTrackDImport(draft), false);
});

test('explicitly excluding a duplicate row lets the remaining reviewed row proceed', async () => {
  const draft = await parseTrackDImportText('101\n101', {
    kind: 'property-roster',
    source,
  });
  const rows = revalidateTrackDImportRows([
    draft.rows[0],
    { ...draft.rows[1], excluded: true },
  ]);
  const reviewed = { ...draft, rows };

  assert.equal(rows[0].conflicts.length, 0);
  assert.equal(canConfirmTrackDImport(reviewed), true);
});

test('image and PDF attachments never fabricate extracted rows', () => {
  const draft = createUnavailableExtractionDraft('daily-release', {
    ...source,
    kind: 'file',
    mimeType: 'application/pdf',
    name: 'release.pdf',
  });

  assert.equal(draft.extractionAvailable, false);
  assert.deepEqual(draft.rows, []);
  assert.equal(
    draft.warnings[0],
    'Source attached — extraction not yet available.',
  );
  assert.equal(canConfirmTrackDImport(draft), false);
});

test('attachment transcription retains the original source reference and File objects', () => {
  const originalFile = new File(['synthetic pdf bytes'], 'release.pdf', {
    type: 'application/pdf',
  });
  const originalSource = {
    ...source,
    id: 'source-pdf',
    kind: 'file',
    mimeType: 'application/pdf',
    name: originalFile.name,
  };
  const fallbackSource = {
    ...source,
    id: 'source-paste',
    kind: 'paste',
    name: 'Pasted source text',
  };
  const retained = resolveTrackDImportProvenance(
    {
      source: originalSource,
      sourceFiles: [originalFile],
    },
    fallbackSource,
  );

  assert.strictEqual(retained.source, originalSource);
  assert.strictEqual(retained.sourceFiles[0], originalFile);
  assert.notStrictEqual(retained.source, fallbackSource);

  const directText = resolveTrackDImportProvenance(null, fallbackSource);
  assert.strictEqual(directText.source, fallbackSource);
  assert.deepEqual(directText.sourceFiles, []);
});

test('500 deterministic roster rows remain reviewable without truncation', async () => {
  const roster = [
    'Unit,Unit Type,Sections,Paint,Clean',
    ...Array.from(
      { length: 500 },
      (_, index) => `${1001 + index},4,"Common,A,B,C,D",yes,yes`,
    ),
  ].join('\n');
  const draft = await parseTrackDImportText(roster, {
    kind: 'property-roster',
    source,
  });

  assert.equal(draft.rows.length, 500);
  assert.equal(draft.rows.at(-1).unitNumber, '1500');
  assert.equal(canConfirmTrackDImport(draft), true);
});

test('Activity excludes proposals and filters only recorded truth', () => {
  const recorded = projectLegacyActivityRecord(
    {
      id: 'activity-1',
      createdAt: '2026-07-28T17:12:00.000Z',
      action: 'Added personal note',
      note: 'Unit 413 touch-up behind the door',
      entityType: 'Unit',
      entityId: 'unit-413',
    },
    {
      actor: 'Los',
      unitId: 'unit-413',
      unitNumber: '413',
      trade: 'Paint',
      section: 'D',
      source: 'Direct note',
      category: 'note',
      confirmed: true,
    },
  );
  const proposal = {
    ...recorded,
    id: 'proposal-1',
    category: 'inspection',
    state: 'proposal',
  };

  assert.deepEqual(
    filterTrackDActivity([proposal, recorded], 'all').map((item) => item.id),
    ['activity-1'],
  );
  assert.equal(filterTrackDActivity([recorded], 'note', '413').length, 1);
  assert.equal(filterTrackDActivity([recorded], 'inspection').length, 0);
});

test('Activity leaves missing actor and source explicitly unrecorded', () => {
  const record = projectLegacyActivityRecord({
    id: 'activity-2',
    createdAt: '2026-07-28T17:12:00.000Z',
    action: 'Imported rows',
    note: '',
    entityType: 'Project',
    entityId: 'project-1',
  });

  assert.equal(record.actor, 'Actor not recorded');
  assert.equal(record.source, 'Source not recorded');
  assert.equal(record.state, 'recorded');
});

test('DraftAction Activity is a proposal by default and requires explicit confirmation to become visible', () => {
  const draftActivity = {
    id: 'draft-activity',
    createdAt: '2026-07-28T17:12:00.000Z',
    action: 'Created draft actions',
    note: 'Two model proposals require review',
    entityType: 'DraftAction',
    entityId: 'draft-1',
  };
  const proposal = projectLegacyActivityRecord(draftActivity);
  const explicitlyConfirmed = projectLegacyActivityRecord(draftActivity, {
    confirmed: true,
    source: 'Confirmed host event',
  });
  const ordinaryLegacy = projectLegacyActivityRecord({
    ...draftActivity,
    id: 'ordinary-activity',
    entityType: 'Unit',
  });

  assert.equal(proposal.state, 'proposal');
  assert.equal(explicitlyConfirmed.state, 'recorded');
  assert.equal(ordinaryLegacy.state, 'recorded');
  assert.deepEqual(
    filterTrackDActivity([proposal, explicitlyConfirmed, ordinaryLegacy], 'all')
      .map((record) => record.id)
      .sort(),
    ['draft-activity', 'ordinary-activity'],
  );
});

test('AppData adapters are read-only, active-project projections with no status inference', () => {
  const data = {
    activeProjectId: 'project-1',
    projects: [
      {
        id: 'project-1',
        propertyName: 'Synthetic Property',
        supervisorName: 'Los',
      },
    ],
    units: [
      { id: 'unit-2', projectId: 'project-1', unitNumber: '202' },
      { id: 'unit-1', projectId: 'project-1', unitNumber: '101' },
      { id: 'other-unit', projectId: 'project-2', unitNumber: '999' },
    ],
    photoNotes: [
      {
        id: 'photo-1',
        projectId: 'project-1',
        unitId: 'unit-2',
      },
    ],
    activityLogs: [
      {
        id: 'activity-photo',
        projectId: 'project-1',
        entityType: 'PhotoNote',
        entityId: 'photo-1',
        action: 'Added personal photo',
        note: 'Paint D behind door',
        createdAt: '2026-07-28T17:12:00.000Z',
      },
      {
        id: 'other-project-activity',
        projectId: 'project-2',
        entityType: 'Project',
        entityId: 'project-2',
        action: 'Other',
        note: '',
        createdAt: '2026-07-28T17:13:00.000Z',
      },
    ],
  };

  assert.deepEqual(selectTrackDUnitOptions(data), [
    { id: 'unit-1', unitNumber: '101' },
    { id: 'unit-2', unitNumber: '202' },
  ]);
  assert.deepEqual(selectTrackDProfileSummary(data), {
    name: 'Los',
    currentProperty: 'Synthetic Property',
    role: 'Turn Supervisor',
  });
  const records = projectTrackDActivityFromAppData(data, {
    'activity-photo': {
      actor: 'Los',
      category: 'note',
      source: 'Direct photo',
    },
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].unitNumber, '202');
  assert.equal(records[0].category, 'note');
  assert.equal(records[0].state, 'recorded');
});

test('official form destinations match the authorized external links exactly', () => {
  assert.deepEqual(
    TRACK_D_OFFICIAL_FORMS.map(({ label, url }) => ({ label, url })),
    [
      {
        label: 'Change Order Approval',
        url: 'https://pds.jotform.com/251384128606962',
      },
      {
        label: 'Backup Safety Submission Box',
        url: 'https://pds.jotform.com/231955109224959',
      },
      {
        label: 'Turn Sign-Off Form',
        url: 'https://pds.jotform.com/251946815029968',
      },
    ],
  );
});

test('Reports distinguish explicit empty datasets from unavailable and not-recorded datasets', () => {
  const metrics = buildTrackDReportMetrics(
    {
      'property-roster': [
        { id: 'unit-1', label: 'Unit 101' },
        { id: 'unit-2', label: 'Unit 102' },
      ],
      'notes-photos': [{ id: 'note-1', label: 'Unit 101 note' }],
      'ready-to-walk': [],
    },
    {
      working: 'Not recorded',
    },
  );

  assert.equal(metrics.length, 16);
  assert.equal(
    metrics.find((metric) => metric.id === 'property-roster').records.length,
    2,
  );
  assert.equal(
    metrics.find((metric) => metric.id === 'ready-to-walk').records.length,
    0,
  );
  assert.equal(
    metrics.find((metric) => metric.id === 'released-today').records,
    undefined,
  );
  assert.equal(
    metrics.find((metric) => metric.id === 'working').statusLabel,
    'Not recorded',
  );
});

test('More groups include the authorized native information architecture', () => {
  assert.deepEqual(
    TRACK_D_MORE_GROUPS.map((group) => [
      group.label,
      group.items.map((item) => item.label),
    ]),
    [
      [
        'Work',
        ['Crews', 'Reports and Proof', 'Official PDS Forms'],
      ],
      [
        'Project',
        ['Setup', 'Property Roster', 'Unit Import', 'Today’s Task', 'Day Sessions'],
      ],
      [
        'Data and Safety',
        ['Backup and Restore', 'Sync', 'Privacy', 'Storage', 'Photo permissions'],
      ],
      [
        'Preferences',
        ['Appearance', 'Language', 'Notifications', 'Reduced motion'],
      ],
      ['Account', ['Profile', 'Sign Out']],
    ],
  );
  assert.equal(
    displayPermissionValue({
      id: 'photo',
      label: 'Photo permission',
    }),
    'Not recorded',
  );
});

test('Track D implementation contains no blocked intelligence or official mutation language', async () => {
  const files = [
    'model.ts',
    'SourceFirstImport.tsx',
    'DirectNotePhoto.tsx',
    'ActivitySurface.tsx',
    'OperationalTools.tsx',
    'appDataProjection.ts',
  ];
  const contents = await Promise.all(
    files.map((file) =>
      readFile(
        new URL(`../src/features/wave2a2-track-d/${file}`, import.meta.url),
        'utf8',
      ),
    ),
  );
  const sourceText = contents.join('\n');

  assert.doesNotMatch(sourceText, /\b(?:OpenAI|Whisper|OCR|Supabase)\b/i);
  assert.doesNotMatch(sourceText, /\b(?:setData|serviceWorker)\b/);
  assert.doesNotMatch(sourceText, /\bautomatically approve\b/i);
  assert.match(sourceText, /Nothing is released or assigned before confirmation/);
});

test('Track D shell and source contracts encode the repaired integration seams', async () => {
  const [primitives, sourceFirstImport, directPhoto] = await Promise.all([
    readFile(
      new URL(
        '../src/features/wave2a2-track-d/TrackDPrimitives.tsx',
        import.meta.url,
      ),
      'utf8',
    ),
    readFile(
      new URL(
        '../src/features/wave2a2-track-d/SourceFirstImport.tsx',
        import.meta.url,
      ),
      'utf8',
    ),
    readFile(
      new URL(
        '../src/features/wave2a2-track-d/DirectNotePhoto.tsx',
        import.meta.url,
      ),
      'utf8',
    ),
  ]);

  assert.doesNotMatch(primitives, /<main\b/);
  assert.match(primitives, /data-track-d-page=/);
  assert.match(directPhoto, /initialFile\?: File/);
  assert.match(directPhoto, /useState<File \| null>\(\(\) =>/);
  assert.match(sourceFirstImport, /sourceFiles: provenance\?\.sourceFiles \?\? \[\]/);
  assert.match(sourceFirstImport, /transcriptionKind/);
  assert.match(sourceFirstImport, /confirmationInFlightRef/);
  assert.match(sourceFirstImport, /Paint scope/);
  assert.match(sourceFirstImport, /Clean scope/);
});

test('Track D styles consume Track A tokens and enforce exact target, responsive, and AA fallback contracts', async () => {
  const css = await readFile(
    new URL('../src/features/wave2a2-track-d/track-d.css', import.meta.url),
    'utf8',
  );

  assert.match(css, /overflow-x:\s*clip/);
  assert.match(css, /font-size:\s*16px/);
  assert.match(
    css,
    /--w2a2d-background:\s*var\(--turn-color-page,\s*#f2f4f7\)/,
  );
  assert.match(
    css,
    /--w2a2d-text:\s*var\(--turn-color-primary,\s*#0a0d12\)/,
  );
  assert.match(
    css,
    /--w2a2d-accent-strong:\s*var\(--turn-color-brand-strong,\s*#0066cc\)/,
  );
  assert.match(
    css,
    /--w2a2d-on-accent:\s*var\(--turn-color-on-brand,\s*#ffffff\)/,
  );
  assert.match(
    css,
    /--w2a2d-on-accent:\s*var\(--turn-color-on-brand,\s*#001a31\)/,
  );
  assert.match(
    css,
    /\.w2a2d-filter-grid button\s*\{[^}]*min-block-size:\s*44px;[^}]*min-inline-size:\s*44px;/s,
  );
  assert.match(
    css,
    /\[data-track-d-critical-target\][^{]*\{[^}]*min-block-size:\s*44px;[^}]*min-inline-size:\s*44px;/s,
  );
  assert.doesNotMatch(
    css,
    /\.w2a2d-filter-grid button\s*\{[^}]*min-block-size:\s*38px/s,
  );
  assert.match(css, /content-visibility:\s*auto/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /@media \(max-width:\s*520px\)/);

  for (const [foreground, background] of [
    ['#ffffff', '#0066cc'],
    ['#001a31', '#63b3ff'],
    ['#0066cc', '#e8f3ff'],
    ['#63b3ff', '#153b5f'],
    ['#626c78', '#ffffff'],
    ['#aaaab0', '#1c1c1e'],
    ['#c43d36', '#ffffff'],
    ['#ff6b64', '#1c1c1e'],
  ]) {
    assert.ok(
      contrastRatio(foreground, background) >= 4.5,
      `${foreground} on ${background} must meet WCAG AA.`,
    );
  }
});

const contrastRatio = (foreground, background) => {
  const values = [relativeLuminance(foreground), relativeLuminance(background)]
    .sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
};

const relativeLuminance = (hex) => {
  const channels = hex
    .match(/[0-9a-f]{2}/gi)
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return (
    0.2126 * channels[0] +
    0.7152 * channels[1] +
    0.0722 * channels[2]
  );
};
