export type TrackDImportKind = 'property-roster' | 'daily-release';

export type TrackDImportSourceKind =
  | 'camera'
  | 'photos'
  | 'file'
  | 'paste'
  | 'manual';

export type TrackDTextTranscriptionKind = Extract<
  TrackDImportSourceKind,
  'paste' | 'manual'
>;

export interface TrackDSourceReference {
  id: string;
  kind: TrackDImportSourceKind;
  name: string;
  mimeType?: string;
  byteSize?: number;
  capturedAt: string;
}

export interface TrackDSourceFileMetadata {
  name: string;
  mimeType: string;
  byteSize: number;
  lastModified: number;
}

export interface TrackDOriginalSource {
  originalText?: string;
  files: readonly TrackDSourceFileMetadata[];
}

export interface TrackDSourceBinding {
  sourceId: string;
  revision: number;
  fingerprint: string;
}

export interface TrackDImportRow {
  id: string;
  sourceRow: number;
  unitNumber: string;
  unitType: string;
  building: string;
  floor: string;
  applicableSections: string[];
  paintRequested?: boolean;
  cleanRequested?: boolean;
  restrictions: string;
  sourceExcerpt: string;
  uncertainties: string[];
  conflicts: string[];
  excluded: boolean;
}

export interface TrackDImportDraft {
  kind: TrackDImportKind;
  source: TrackDSourceReference;
  sourceBinding: TrackDSourceBinding;
  originalSource: TrackDOriginalSource;
  rows: TrackDImportRow[];
  warnings: string[];
  extractionAvailable: boolean;
  transcriptionKind?: TrackDTextTranscriptionKind;
}

export interface TrackDConfirmedImport {
  kind: TrackDImportKind;
  source: TrackDSourceReference;
  sourceBinding: TrackDSourceBinding;
  originalSource: TrackDOriginalSource;
  rows: TrackDImportRow[];
  sourceFiles: readonly File[];
  confirmedAt: string;
  transcriptionKind?: TrackDTextTranscriptionKind;
}

export interface TrackDImportCommitReceipt {
  /** Returned only after the complete source-bound transaction commits. */
  committed: true;
  sourceBinding: TrackDSourceBinding;
}

export interface TrackDImportProvenance {
  source: TrackDSourceReference;
  sourceFiles: readonly File[];
  originalText?: string;
  revision: number;
  fingerprint: string;
}

export interface TrackDImportParseOptions {
  existingUnitNumbers?: Iterable<string>;
  source: TrackDSourceReference;
  kind: TrackDImportKind;
  sourceFiles?: readonly File[];
  sourceRevision?: number;
}

export interface TrackDSaveReceipt {
  recordId: string;
  message: string;
}

export interface TrackDNoteRequest {
  wording: string;
  unitId?: string;
  recordedAt: string;
}

export interface TrackDPhotoContext {
  propertyId?: string;
  unitId?: string;
  trade?: 'Paint' | 'Clean';
  section?: string;
  caption: string;
}

export interface TrackDPhotoRequest {
  file: File;
  context: TrackDPhotoContext;
  recordedAt: string;
}

export type TrackDActivityCategory =
  | 'note'
  | 'assignment'
  | 'crew-report'
  | 'inspection'
  | 'callback'
  | 'walk'
  | 'import'
  | 'day-session'
  | 'other';

export type TrackDActivityBoundary =
  | 'personal-record'
  | 'official-reference';

export interface TrackDActivityRecord {
  id: string;
  recordedAt: string;
  actor: string;
  unitId?: string;
  unitNumber?: string;
  trade?: 'Paint' | 'Clean';
  section?: string;
  action: string;
  source: string;
  boundary: TrackDActivityBoundary;
  category: TrackDActivityCategory;
  summary: string;
  state: 'recorded' | 'proposal';
}

export type TrackDActivityFilter =
  | 'all'
  | Exclude<TrackDActivityCategory, 'other'>;

export interface TrackDLegacyActivityInput {
  id: string;
  createdAt: string;
  action: string;
  note: string;
  entityType: string;
  entityId: string;
}

export interface TrackDLegacyActivityContext {
  actor?: string;
  unitId?: string;
  unitNumber?: string;
  trade?: 'Paint' | 'Clean';
  section?: string;
  source?: string;
  boundary?: TrackDActivityBoundary;
  category?: TrackDActivityCategory;
  confirmed?: boolean;
}

export interface TrackDReportRecordLink {
  id: string;
  label: string;
  recordedAt?: string;
}

export type TrackDReportMetricId =
  | 'property-roster'
  | 'released-today'
  | 'working'
  | 'waiting'
  | 'crew-reported-complete'
  | 'sections-inspected'
  | 'callbacks-opened'
  | 'callbacks-resolved'
  | 'ready-to-walk'
  | 'property-accepted'
  | 'units-touched'
  | 'notes-photos'
  | 'day-sessions'
  | 'paper-reconciliation'
  | 'backup-status'
  | 'sync-status';

export interface TrackDReportMetric {
  id: TrackDReportMetricId;
  label: string;
  records?: readonly TrackDReportRecordLink[];
  statusLabel?: string;
}

export type TrackDMoreDestination =
  | 'crews'
  | 'reports-and-proof'
  | 'official-pds-forms'
  | 'setup'
  | 'property-roster'
  | 'unit-import'
  | 'todays-task'
  | 'day-sessions'
  | 'backup-restore'
  | 'sync'
  | 'privacy'
  | 'storage'
  | 'photo-permissions'
  | 'appearance'
  | 'language'
  | 'notifications'
  | 'reduced-motion'
  | 'profile'
  | 'sign-out';

export interface TrackDMoreItem {
  id: TrackDMoreDestination;
  label: string;
}

export interface TrackDMoreGroup {
  id: 'work' | 'project' | 'data-safety' | 'preferences' | 'account';
  label: string;
  items: readonly TrackDMoreItem[];
}

export interface TrackDPermissionRecord {
  id:
    | 'development-mode'
    | 'local-storage'
    | 'synced-storage'
    | 'ai-processing'
    | 'photo'
    | 'contact-phone';
  label: string;
  value?: string;
  detail?: string;
}

export interface TrackDOfficialForm {
  id: 'change-order' | 'backup-safety' | 'turn-sign-off';
  label: string;
  url: string;
}

export const TRACK_D_OFFICIAL_FORMS: readonly TrackDOfficialForm[] = [
  {
    id: 'change-order',
    label: 'Change Order Approval',
    url: 'https://pds.jotform.com/251384128606962',
  },
  {
    id: 'backup-safety',
    label: 'Backup Safety Submission Box',
    url: 'https://pds.jotform.com/231955109224959',
  },
  {
    id: 'turn-sign-off',
    label: 'Turn Sign-Off Form',
    url: 'https://pds.jotform.com/251946815029968',
  },
] as const;

export const TRACK_D_ACTIVITY_FILTERS: readonly {
  id: TrackDActivityFilter;
  label: string;
}[] = [
  { id: 'all', label: 'All' },
  { id: 'note', label: 'Notes' },
  { id: 'assignment', label: 'Assignments' },
  { id: 'crew-report', label: 'Crew reports' },
  { id: 'inspection', label: 'Inspections' },
  { id: 'callback', label: 'Callbacks' },
  { id: 'walk', label: 'Walks' },
  { id: 'import', label: 'Imports' },
  { id: 'day-session', label: 'Day sessions' },
] as const;

export const TRACK_D_REPORT_LABELS: Readonly<
  Record<TrackDReportMetricId, string>
> = {
  'property-roster': 'Property roster',
  'released-today': 'Released today',
  working: 'Working',
  waiting: 'Waiting',
  'crew-reported-complete': 'Crew reported complete',
  'sections-inspected': 'Sections inspected',
  'callbacks-opened': 'Callbacks opened',
  'callbacks-resolved': 'Callbacks resolved',
  'ready-to-walk': 'Ready to walk',
  'property-accepted': 'Property accepted',
  'units-touched': 'Units touched',
  'notes-photos': 'Notes/photos',
  'day-sessions': 'Day sessions',
  'paper-reconciliation': 'Paper reconciliation',
  'backup-status': 'Backup status',
  'sync-status': 'Sync status',
};

export const TRACK_D_MORE_GROUPS: readonly TrackDMoreGroup[] = [
  {
    id: 'work',
    label: 'Work',
    items: [
      { id: 'crews', label: 'Crews' },
      { id: 'reports-and-proof', label: 'Reports and Proof' },
      { id: 'official-pds-forms', label: 'Official PDS Forms' },
    ],
  },
  {
    id: 'project',
    label: 'Project',
    items: [
      { id: 'setup', label: 'Setup' },
      { id: 'property-roster', label: 'Property Roster' },
      { id: 'unit-import', label: 'Unit Import' },
      { id: 'todays-task', label: 'Today’s Task' },
      { id: 'day-sessions', label: 'Day Sessions' },
    ],
  },
  {
    id: 'data-safety',
    label: 'Data and Safety',
    items: [
      { id: 'backup-restore', label: 'Backup and Restore' },
      { id: 'sync', label: 'Sync' },
      { id: 'privacy', label: 'Privacy' },
      { id: 'storage', label: 'Storage' },
      { id: 'photo-permissions', label: 'Photo permissions' },
    ],
  },
  {
    id: 'preferences',
    label: 'Preferences',
    items: [
      { id: 'appearance', label: 'Appearance' },
      { id: 'language', label: 'Language' },
      { id: 'notifications', label: 'Notifications' },
      { id: 'reduced-motion', label: 'Reduced motion' },
    ],
  },
  {
    id: 'account',
    label: 'Account',
    items: [
      { id: 'profile', label: 'Profile' },
      { id: 'sign-out', label: 'Sign Out' },
    ],
  },
] as const;

const HEADER_ALIASES = new Map<string, keyof Omit<
  TrackDImportRow,
  | 'id'
  | 'sourceRow'
  | 'sourceExcerpt'
  | 'uncertainties'
  | 'conflicts'
  | 'excluded'
>>([
  ['unit', 'unitNumber'],
  ['unit number', 'unitNumber'],
  ['unit #', 'unitNumber'],
  ['apartment', 'unitNumber'],
  ['apt', 'unitNumber'],
  ['unit type', 'unitType'],
  ['type', 'unitType'],
  ['building', 'building'],
  ['bldg', 'building'],
  ['floor', 'floor'],
  ['level', 'floor'],
  ['sections', 'applicableSections'],
  ['rooms', 'applicableSections'],
  ['bedrooms', 'applicableSections'],
  ['paint', 'paintRequested'],
  ['painting', 'paintRequested'],
  ['clean', 'cleanRequested'],
  ['cleaning', 'cleanRequested'],
  ['restriction', 'restrictions'],
  ['restrictions', 'restrictions'],
  ['notes', 'restrictions'],
]);

const normalizeHeader = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/\s+/g, ' ');

const normalizeUnitKey = (value: string) =>
  value.trim().normalize('NFKC').toLocaleLowerCase('en-US');

const sourceFileMetadata = (
  files: readonly File[] = [],
): TrackDSourceFileMetadata[] =>
  files.map((file) => ({
    name: file.name,
    mimeType: file.type,
    byteSize: file.size,
    lastModified: file.lastModified,
  }));

const stableSourceFingerprint = (
  source: TrackDSourceReference,
  originalSource: TrackDOriginalSource,
) => {
  const serialized = JSON.stringify({
    source: {
      id: source.id,
      kind: source.kind,
      name: source.name,
      mimeType: source.mimeType ?? '',
      byteSize: source.byteSize ?? null,
      capturedAt: source.capturedAt,
    },
    originalText: originalSource.originalText ?? null,
    files: originalSource.files,
  });
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

export const createTrackDSourceBinding = (
  source: TrackDSourceReference,
  revision: number,
  originalText?: string,
  files: readonly File[] = [],
): {
  binding: TrackDSourceBinding;
  originalSource: TrackDOriginalSource;
} => {
  const originalSource: TrackDOriginalSource = {
    ...(originalText !== undefined ? { originalText } : {}),
    files: sourceFileMetadata(files),
  };
  return {
    binding: {
      sourceId: source.id,
      revision,
      fingerprint: stableSourceFingerprint(source, originalSource),
    },
    originalSource,
  };
};

const createRowId = (sourceId: string, sourceRow: number) =>
  `${sourceId}-row-${sourceRow}`;

const parseRequested = (
  value: string,
  label: string,
  uncertainties: string[],
) => {
  const normalized = value.trim().toLocaleLowerCase('en-US');
  if (!normalized) return undefined;
  if (['yes', 'y', 'true', '1', 'required', 'needed'].includes(normalized)) {
    return true;
  }
  if (
    ['no', 'n', 'false', '0', 'not required', 'not needed', 'n/a', 'na'].includes(
      normalized,
    )
  ) {
    return false;
  }
  uncertainties.push(`${label} value “${value.trim()}” needs review.`);
  return undefined;
};

const parseSections = (value: string, uncertainties: string[]) => {
  if (!value.trim()) return [];
  const sections: string[] = [];
  const unknown: string[] = [];
  value
    .split(/[,/| ]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const normalized = part.toLocaleLowerCase('en-US');
      if (['common', 'comm', 'commonarea', 'common-area'].includes(normalized)) {
        if (!sections.includes('Common')) sections.push('Common');
        return;
      }
      const upper = part.toLocaleUpperCase('en-US');
      if (/^[A-E]$/.test(upper)) {
        if (!sections.includes(upper)) sections.push(upper);
        return;
      }
      unknown.push(part);
    });
  if (unknown.length > 0) {
    uncertainties.push(
      `Unrecognized section value${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}.`,
    );
  }
  return sections;
};

const emptyRow = (
  source: TrackDSourceReference,
  sourceRow: number,
  sourceExcerpt: string,
): TrackDImportRow => ({
  id: createRowId(source.id, sourceRow),
  sourceRow,
  unitNumber: '',
  unitType: '',
  building: '',
  floor: '',
  applicableSections: [],
  restrictions: '',
  sourceExcerpt,
  uncertainties: [],
  conflicts: [],
  excluded: false,
});

const TRACK_D_ROW_CONFLICTS = new Set([
  'Duplicate Unit in this source.',
  'Unit already exists in the supplied roster.',
  'Unit is not in the supplied property roster.',
  'Unit number is required.',
  'Unit number format needs review.',
]);

const isGeneratedRowConflict = (conflict: string) =>
  TRACK_D_ROW_CONFLICTS.has(conflict) ||
  conflict.startsWith('Section ');

const isPlausibleUnitNumber = (value: string) =>
  /^(?=.*\d)[A-Za-z0-9][A-Za-z0-9 .#-]*$/.test(value.trim());

export const revalidateTrackDImportRows = (
  rows: TrackDImportRow[],
  existingUnitNumbers: Iterable<string> = [],
  kind: TrackDImportKind = 'property-roster',
) => {
  const existing = new Set(
    Array.from(existingUnitNumbers, (unitNumber) => normalizeUnitKey(unitNumber)),
  );
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    if (row.excluded) return;
    const key = normalizeUnitKey(row.unitNumber);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return rows.map((row) => {
    const key = normalizeUnitKey(row.unitNumber);
    const conflicts = row.conflicts.filter(
      (conflict) => !isGeneratedRowConflict(conflict),
    );
    if (!row.excluded && key && (counts.get(key) ?? 0) > 1) {
      conflicts.push('Duplicate Unit in this source.');
    }
    if (
      !row.excluded &&
      key &&
      kind === 'property-roster' &&
      existing.has(key)
    ) {
      conflicts.push('Unit already exists in the supplied roster.');
    }
    if (
      !row.excluded &&
      key &&
      kind === 'daily-release' &&
      !existing.has(key)
    ) {
      conflicts.push('Unit is not in the supplied property roster.');
    }
    if (!row.excluded && !key) conflicts.push('Unit number is required.');
    if (!row.excluded && key && !isPlausibleUnitNumber(row.unitNumber)) {
      conflicts.push('Unit number format needs review.');
    }
    if (!row.excluded) {
      const unitType = Number.parseInt(row.unitType.trim(), 10);
      row.applicableSections.forEach((section) => {
        const normalized = section.trim().toLocaleUpperCase('en-US');
        if (normalized === 'COMMON') return;
        if (!/^[A-E]$/.test(normalized)) {
          conflicts.push(`Section ${section} is not supported.`);
          return;
        }
        if (
          Number.isInteger(unitType) &&
          unitType >= 1 &&
          unitType <= 5 &&
          normalized.charCodeAt(0) - 64 > unitType
        ) {
          conflicts.push(
            `Section ${normalized} is not valid for Unit type ${unitType}.`,
          );
        }
      });
    }
    return { ...row, conflicts };
  });
};

const looksLikeDelimitedHeader = (line: string) => {
  const cells = line.split(/[,;\t]/).map(normalizeHeader);
  return cells.some((cell) => HEADER_ALIASES.get(cell) === 'unitNumber');
};

const parseDelimitedText = async (
  text: string,
  options: TrackDImportParseOptions,
) => {
  const { default: Papa } = await import('papaparse');
  const parsed = Papa.parse<string[]>(text, {
    skipEmptyLines: 'greedy',
  });
  const records = parsed.data.map((record) =>
    record.map((cell) => String(cell ?? '').trim()),
  );
  const headers = records[0] ?? [];
  const mappedHeaders = headers.map((header) =>
    HEADER_ALIASES.get(normalizeHeader(header)),
  );
  const warnings = parsed.errors.map((error) => error.message);
  const normalizedHeaders = headers.map(normalizeHeader);
  if (
    normalizedHeaders.some(
      (header) =>
        ['trade', 'service', 'carpet', 'carpet cleaning', 'repair'].includes(
          header,
        ) || /(?:carpet|resurface|maintenance|repair)/.test(header),
    )
  ) {
    warnings.push(
      'Unsupported trade column found. This intake accepts explicit Paint and Clean scope only.',
    );
  }
  const originalLines = text.split(/\r\n|\n|\r/);
  const rows = records.slice(1).map((record, index) => {
    const sourceRow = index + 2;
    const row = emptyRow(
      options.source,
      sourceRow,
      originalLines[sourceRow - 1] ?? record.join(' | '),
    );
    if (record.length !== headers.length) {
      row.conflicts.push(
        `Source row has ${record.length} columns; expected ${headers.length}.`,
      );
    }
    const seenScopeValues = new Map<string, string>();
    record.forEach((value, cellIndex) => {
      const field = mappedHeaders[cellIndex];
      if (!field || !value) return;
      if (field === 'paintRequested' || field === 'cleanRequested') {
        const previous = seenScopeValues.get(field);
        if (
          previous !== undefined &&
          normalizeHeader(previous) !== normalizeHeader(value)
        ) {
          row.conflicts.push(
            `Conflicting ${field === 'paintRequested' ? 'Paint' : 'Clean'} scope values in this source row.`,
          );
        }
        seenScopeValues.set(field, value);
      }
      if (field === 'applicableSections') {
        row.applicableSections = parseSections(value, row.uncertainties);
      } else if (field === 'paintRequested') {
        row.paintRequested = parseRequested(
          value,
          'Paint',
          row.uncertainties,
        );
      } else if (field === 'cleanRequested') {
        row.cleanRequested = parseRequested(
          value,
          'Clean',
          row.uncertainties,
        );
      } else {
        row[field] = value;
      }
    });
    return row;
  });
  return {
    rows: revalidateTrackDImportRows(
      rows,
      options.existingUnitNumbers,
      options.kind,
    ),
    warnings,
  };
};

const MANUAL_FIELD_ALIASES = new Map<
  string,
  | 'unitNumber'
  | 'unitType'
  | 'building'
  | 'floor'
  | 'applicableSections'
  | 'paintRequested'
  | 'cleanRequested'
  | 'restrictions'
>([
  ['unit', 'unitNumber'],
  ['type', 'unitType'],
  ['building', 'building'],
  ['bldg', 'building'],
  ['floor', 'floor'],
  ['sections', 'applicableSections'],
  ['rooms', 'applicableSections'],
  ['paint', 'paintRequested'],
  ['clean', 'cleanRequested'],
  ['notes', 'restrictions'],
  ['restrictions', 'restrictions'],
]);

const parseManualText = (
  text: string,
  options: TrackDImportParseOptions,
) => {
  const rows = text
    .split(/\r?\n/)
    .map((sourceExcerpt, index) => ({
      line: sourceExcerpt.trim(),
      sourceExcerpt,
      sourceRow: index + 1,
    }))
    .filter(({ line }) => Boolean(line))
    .map(({ line, sourceExcerpt, sourceRow }) => {
      const row = emptyRow(options.source, sourceRow, sourceExcerpt);
      const pieces = line
        .split(/[;|]/)
        .map((piece) => piece.trim())
        .filter(Boolean);

      pieces.forEach((piece, pieceIndex) => {
        const match = piece.match(/^([^:]+):\s*(.*)$/);
        if (!match) {
          if (pieceIndex === 0) {
            row.unitNumber = piece.replace(/^unit\s+/i, '').trim();
          } else {
            row.uncertainties.push(`Unlabeled text needs review: “${piece}”.`);
          }
          return;
        }
        const label = normalizeHeader(match[1]);
        const value = match[2].trim();
        const field = MANUAL_FIELD_ALIASES.get(label);
        if (!field) {
          row.uncertainties.push(`Unrecognized label “${match[1].trim()}”.`);
          return;
        }
        if (field === 'applicableSections') {
          row.applicableSections = parseSections(value, row.uncertainties);
        } else if (field === 'paintRequested') {
          row.paintRequested = parseRequested(
            value,
            'Paint',
            row.uncertainties,
          );
        } else if (field === 'cleanRequested') {
          row.cleanRequested = parseRequested(
            value,
            'Clean',
            row.uncertainties,
          );
        } else {
          row[field] = value;
        }
      });
      return row;
    });
  return {
    rows: revalidateTrackDImportRows(
      rows,
      options.existingUnitNumbers,
      options.kind,
    ),
    warnings: [] as string[],
  };
};

export async function parseTrackDImportText(
  text: string,
  options: TrackDImportParseOptions,
): Promise<TrackDImportDraft> {
  const { binding, originalSource } = createTrackDSourceBinding(
    options.source,
    options.sourceRevision ?? 1,
    text,
    options.sourceFiles,
  );
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      kind: options.kind,
      source: options.source,
      sourceBinding: binding,
      originalSource,
      rows: [],
      warnings: ['Add source text before creating a preview.'],
      extractionAvailable: true,
    };
  }
  const firstLine = trimmed.split(/\r?\n/, 1)[0] ?? '';
  const result = looksLikeDelimitedHeader(firstLine)
    ? await parseDelimitedText(text, options)
    : parseManualText(text, options);
  return {
    kind: options.kind,
    source: options.source,
    sourceBinding: binding,
    originalSource,
    rows: result.rows,
    warnings: result.warnings,
    extractionAvailable: true,
  };
}

export function createUnavailableExtractionDraft(
  kind: TrackDImportKind,
  source: TrackDSourceReference,
  sourceFiles: readonly File[] = [],
  sourceRevision = 1,
): TrackDImportDraft {
  const { binding, originalSource } = createTrackDSourceBinding(
    source,
    sourceRevision,
    undefined,
    sourceFiles,
  );
  return {
    kind,
    source,
    sourceBinding: binding,
    originalSource,
    rows: [],
    warnings: ['Source attached — extraction not yet available.'],
    extractionAvailable: false,
  };
}

export function isTrackDImportDraftCurrent(
  draft: TrackDImportDraft,
  provenance: TrackDImportProvenance | null | undefined,
) {
  if (!provenance) return false;
  const current = createTrackDSourceBinding(
    provenance.source,
    provenance.revision,
    provenance.originalText,
    provenance.sourceFiles,
  );
  return Boolean(
    current.binding.fingerprint === provenance.fingerprint &&
      draft.sourceBinding.sourceId === provenance.source.id &&
      draft.sourceBinding.revision === provenance.revision &&
      draft.sourceBinding.fingerprint === provenance.fingerprint,
  );
}

export function canConfirmTrackDImport(
  draft: TrackDImportDraft,
  provenance?: TrackDImportProvenance | null,
) {
  const included = draft.rows.filter((row) => !row.excluded);
  return (
    (provenance === undefined ||
      isTrackDImportDraftCurrent(draft, provenance)) &&
    draft.extractionAvailable &&
    draft.warnings.length === 0 &&
    included.length > 0 &&
    included.every(
      (row) =>
        row.unitNumber.trim() &&
        row.conflicts.length === 0 &&
        row.uncertainties.length === 0,
    )
  );
}

export function prepareTrackDConfirmedImport(
  draft: TrackDImportDraft,
  provenance: TrackDImportProvenance | null | undefined,
  existingUnitNumbers: Iterable<string> = [],
  confirmedAt = new Date().toISOString(),
): TrackDConfirmedImport | null {
  if (!provenance || !isTrackDImportDraftCurrent(draft, provenance)) {
    return null;
  }
  const rows = revalidateTrackDImportRows(
    draft.rows,
    existingUnitNumbers,
    draft.kind,
  );
  const revalidatedDraft: TrackDImportDraft = { ...draft, rows };
  if (!canConfirmTrackDImport(revalidatedDraft, provenance)) return null;

  return {
    kind: revalidatedDraft.kind,
    source: revalidatedDraft.source,
    sourceBinding: revalidatedDraft.sourceBinding,
    originalSource: revalidatedDraft.originalSource,
    rows: rows.filter((row) => !row.excluded),
    sourceFiles: provenance.sourceFiles,
    confirmedAt,
    ...(revalidatedDraft.transcriptionKind
      ? { transcriptionKind: revalidatedDraft.transcriptionKind }
      : {}),
  };
}

export function trackDSourceBindingsMatch(
  left: TrackDSourceBinding,
  right: TrackDSourceBinding,
) {
  return (
    left.sourceId === right.sourceId &&
    left.revision === right.revision &&
    left.fingerprint === right.fingerprint
  );
}

export function isTrackDImportCommitReceipt(
  value: unknown,
  expectedBinding: TrackDSourceBinding,
): value is TrackDImportCommitReceipt {
  if (!value || typeof value !== 'object') return false;
  const receipt = value as Partial<TrackDImportCommitReceipt>;
  return (
    receipt.committed === true &&
    Boolean(receipt.sourceBinding) &&
    trackDSourceBindingsMatch(
      receipt.sourceBinding as TrackDSourceBinding,
      expectedBinding,
    )
  );
}

export function isTrackDSaveReceipt(
  value: unknown,
): value is TrackDSaveReceipt {
  if (!value || typeof value !== 'object') return false;
  const receipt = value as Partial<TrackDSaveReceipt>;
  return Boolean(receipt.recordId?.trim() && receipt.message?.trim());
}

export function resolveTrackDImportProvenance(
  attached: TrackDImportProvenance | null | undefined,
  fallbackSource: TrackDSourceReference,
): TrackDImportProvenance {
  if (attached) {
    return {
      source: attached.source,
      sourceFiles: attached.sourceFiles,
      ...(attached.originalText !== undefined
        ? { originalText: attached.originalText }
        : {}),
      revision: attached.revision,
      fingerprint: attached.fingerprint,
    };
  }
  const { binding } = createTrackDSourceBinding(fallbackSource, 1);
  return {
    source: fallbackSource,
    sourceFiles: [],
    revision: binding.revision,
    fingerprint: binding.fingerprint,
  };
}

export function filterTrackDActivity(
  records: readonly TrackDActivityRecord[],
  filter: TrackDActivityFilter,
  query = '',
) {
  const normalizedQuery = query.trim().toLocaleLowerCase('en-US');
  return records
    .filter((record) => record.state === 'recorded')
    .filter((record) => filter === 'all' || record.category === filter)
    .filter((record) => {
      if (!normalizedQuery) return true;
      return [
        record.actor,
        record.unitNumber,
        record.trade,
        record.section,
        record.action,
        record.source,
        record.summary,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLocaleLowerCase('en-US').includes(normalizedQuery),
        );
    })
    .slice()
    .sort(
      (left, right) =>
        Date.parse(right.recordedAt) - Date.parse(left.recordedAt),
    );
}

export function projectLegacyActivityRecord(
  activity: TrackDLegacyActivityInput,
  context: TrackDLegacyActivityContext = {},
): TrackDActivityRecord {
  const isUnconfirmedProposal =
    context.confirmed === false ||
    (activity.entityType === 'DraftAction' && context.confirmed !== true);
  return {
    id: activity.id,
    recordedAt: activity.createdAt,
    actor: context.actor?.trim() || 'Actor not recorded',
    ...(context.unitId ? { unitId: context.unitId } : {}),
    ...(context.unitNumber ? { unitNumber: context.unitNumber } : {}),
    ...(context.trade ? { trade: context.trade } : {}),
    ...(context.section ? { section: context.section } : {}),
    action: activity.action,
    source: context.source?.trim() || 'Source not recorded',
    boundary: context.boundary ?? 'personal-record',
    category: context.category ?? 'other',
    summary: activity.note || activity.action,
    state: isUnconfirmedProposal ? 'proposal' : 'recorded',
  };
}

export function buildTrackDReportMetrics(
  recordsByMetric: Partial<
    Record<TrackDReportMetricId, readonly TrackDReportRecordLink[]>
  >,
  statuses: Partial<Record<TrackDReportMetricId, string>> = {},
): TrackDReportMetric[] {
  return (Object.keys(TRACK_D_REPORT_LABELS) as TrackDReportMetricId[]).map((id) => {
    const records = recordsByMetric[id];
    return {
      id,
      label: TRACK_D_REPORT_LABELS[id],
      ...(records !== undefined ? { records } : {}),
      ...(statuses[id] ? { statusLabel: statuses[id] } : {}),
    };
  });
}

export function displayPermissionValue(permission: TrackDPermissionRecord) {
  return permission.value?.trim() || 'Not recorded';
}
