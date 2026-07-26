import type {
  AssignmentAttachmentMetadata,
  AssignmentColumnField,
  AssignmentColumnMapping,
  AssignmentEditableField,
  AssignmentIntakeConfirmationResult,
  AssignmentIntakeDraft,
  AssignmentIntakeFlag,
  AssignmentIntakeRecord,
  AssignmentIntakeSection,
  AssignmentIntakeSourceKind,
  AssignmentIntakeTrade,
} from './types';

export const ASSIGNMENT_INTAKE_MAX_BYTES = 2 * 1024 * 1024;
export const ASSIGNMENT_INTAKE_MAX_ROWS = 5_000;

const MAX_UNIT_LENGTH = 40;
const MAX_CREW_LENGTH = 120;
const MAX_NOTES_LENGTH = 2_000;
const REQUIRED_MAPPING_FIELDS: AssignmentColumnField[] = ['unit', 'section', 'trade'];
const ALL_MAPPING_FIELDS: AssignmentColumnField[] = ['unit', 'section', 'trade', 'crew', 'notes'];

const HEADER_ALIASES = new Map<string, AssignmentColumnField>([
  ['unit', 'unit'],
  ['unit number', 'unit'],
  ['unit no', 'unit'],
  ['apartment', 'unit'],
  ['apartment number', 'unit'],
  ['apt', 'unit'],
  ['apt number', 'unit'],
  ['section', 'section'],
  ['unit section', 'section'],
  ['room', 'section'],
  ['bedroom', 'section'],
  ['area', 'section'],
  ['trade', 'trade'],
  ['service', 'trade'],
  ['scope', 'trade'],
  ['work type', 'trade'],
  ['crew', 'crew'],
  ['crew name', 'crew'],
  ['team', 'crew'],
  ['vendor', 'crew'],
  ['notes', 'notes'],
  ['note', 'notes'],
  ['comments', 'notes'],
  ['comment', 'notes'],
]);

const SECTION_ALIASES = new Map<string, AssignmentIntakeSection>([
  ['common', 'Common'],
  ['common area', 'Common'],
  ['comm', 'Common'],
  ['a', 'A'],
  ['bedroom a', 'A'],
  ['room a', 'A'],
  ['b', 'B'],
  ['bedroom b', 'B'],
  ['room b', 'B'],
  ['c', 'C'],
  ['bedroom c', 'C'],
  ['room c', 'C'],
  ['d', 'D'],
  ['bedroom d', 'D'],
  ['room d', 'D'],
  ['e', 'E'],
  ['bedroom e', 'E'],
  ['room e', 'E'],
]);

const TRADE_ALIASES = new Map<string, AssignmentIntakeTrade>([
  ['paint', 'Paint'],
  ['painting', 'Paint'],
  ['clean', 'Clean'],
  ['cleaning', 'Clean'],
]);

const normalizeSpace = (value: string) => value.trim().replace(/\s+/g, ' ');
const normalizeKey = (value: string) =>
  normalizeSpace(value)
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/#/g, ' number ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const hashText = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const containsUnsafeControlCharacter = (value: string) =>
  Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code === 127 || (code >= 0 && code <= 31 && code !== 9 && code !== 10 && code !== 13);
  });

const createFlag = (
  code: AssignmentIntakeFlag['code'],
  severity: AssignmentIntakeFlag['severity'],
  message: string,
  field?: AssignmentEditableField,
): AssignmentIntakeFlag => ({ code, severity, message, ...(field ? { field } : {}) });

const canonicalSection = (value: string) => SECTION_ALIASES.get(normalizeKey(value));
const canonicalTrade = (value: string) => TRADE_ALIASES.get(normalizeKey(value));

export interface AssignmentAttachmentLike {
  name: string;
  type?: string;
  size: number;
  lastModified?: number;
}

export const createAssignmentAttachmentMetadata = (
  attachment: AssignmentAttachmentLike,
): AssignmentAttachmentMetadata => ({
  name: attachment.name,
  ...(attachment.type ? { mediaType: attachment.type } : {}),
  sizeBytes: attachment.size,
  ...(attachment.lastModified !== undefined ? { lastModified: attachment.lastModified } : {}),
  referenceOnly: true,
  contentsPersisted: false,
});

export const suggestAssignmentColumnMapping = (headers: string[]): AssignmentColumnMapping => {
  const mapping: AssignmentColumnMapping = {};
  const claimed = new Set<AssignmentColumnField>();
  headers.forEach((header, index) => {
    const field = HEADER_ALIASES.get(normalizeKey(header));
    if (field && !claimed.has(field)) {
      mapping[field] = index;
      claimed.add(field);
    }
  });
  return mapping;
};

interface ParsedDelimitedInput {
  headers: string[];
  rows: Array<{ cells: string[]; originalWording: string }>;
  delimiter?: string;
  fatalErrors: string[];
  warnings: string[];
}

const emptyDelimitedInput = (fatalErrors: string[]): ParsedDelimitedInput => ({
  headers: [],
  rows: [],
  fatalErrors,
  warnings: [],
});

const parseDelimitedInput = async (text: string): Promise<ParsedDelimitedInput> => {
  const { default: Papa } = await import('papaparse');
  const records: Array<{ cells: string[]; originalWording: string }> = [];
  const errors: Array<{ code: string; message: string; row?: number }> = [];
  let delimiter = '';
  let previousCursor = 0;
  Papa.parse<string[]>(text, {
    skipEmptyLines: 'greedy',
    step(result) {
      delimiter = result.meta.delimiter || delimiter;
      records.push({
        cells: result.data.map((cell) => String(cell ?? '')),
        originalWording: text.slice(previousCursor, result.meta.cursor),
      });
      previousCursor = result.meta.cursor;
      errors.push(...result.errors);
    },
  });
  const delimiterWarnings = errors.filter((error) => error.code === 'UndetectableDelimiter');
  const parseErrors = errors.filter((error) => error.code !== 'UndetectableDelimiter');
  if (parseErrors.length > 0) {
    return emptyDelimitedInput(
      parseErrors.slice(0, 5).map((error) => {
        const row = typeof error.row === 'number' ? ` near record ${error.row + 1}` : '';
        return `Source could not be parsed${row}: ${error.message}`;
      }),
    );
  }

  if (records.length === 0) {
    return emptyDelimitedInput(['Source does not contain a header row.']);
  }

  return {
    headers: records[0].cells.map((header) => header.replace(/^\ufeff/, '').trim()),
    rows: records.slice(1),
    ...(delimiter ? { delimiter } : {}),
    fatalErrors: [],
    warnings:
      delimiterWarnings.length > 0
        ? ['No delimiter was detected. Choose or paste a CSV or tab-delimited table with headers.']
        : [],
  };
};

interface RecordInputs {
  id: string;
  sourceRow: number;
  originalWording: string;
  sourceCells?: string[];
  unitInput: string;
  sectionInput: string;
  tradeInput: string;
  crewInput: string;
  notesInput: string;
  corrections?: AssignmentIntakeRecord['corrections'];
  positionalInterpretation?: boolean;
}

const buildRecord = (input: RecordInputs): AssignmentIntakeRecord => {
  const unitNumber = normalizeSpace(input.unitInput);
  const section = canonicalSection(input.sectionInput);
  const trade = canonicalTrade(input.tradeInput);
  const crewName = normalizeSpace(input.crewInput);
  const notes = input.notesInput.trim();
  const flags: AssignmentIntakeFlag[] = [];

  if (!unitNumber) {
    flags.push(createFlag('missing-unit', 'blocking', 'Unit is required.', 'unitInput'));
  } else if (unitNumber.length > MAX_UNIT_LENGTH || containsUnsafeControlCharacter(unitNumber)) {
    flags.push(
      createFlag(
        'invalid-unit',
        'blocking',
        `Unit must be ${MAX_UNIT_LENGTH} characters or fewer and contain no control characters.`,
        'unitInput',
      ),
    );
  }

  if (!normalizeSpace(input.sectionInput)) {
    flags.push(createFlag('missing-section', 'blocking', 'Section is required.', 'sectionInput'));
  } else if (!section) {
    flags.push(
      createFlag(
        'unknown-section',
        'blocking',
        'Section must be Common or A–E. The source value was preserved for correction.',
        'sectionInput',
      ),
    );
  }

  if (!normalizeSpace(input.tradeInput)) {
    flags.push(createFlag('missing-trade', 'blocking', 'Trade is required.', 'tradeInput'));
  } else if (!trade) {
    flags.push(
      createFlag(
        'unknown-trade',
        'blocking',
        'Trade must be Paint or Clean for this candidate. The source value was preserved for correction.',
        'tradeInput',
      ),
    );
  }

  if (
    !normalizeSpace(input.unitInput) &&
    !normalizeSpace(input.sectionInput) &&
    !normalizeSpace(input.tradeInput) &&
    input.originalWording.trim()
  ) {
    flags.push(
      createFlag(
        'unstructured-row',
        'blocking',
        'This line could not be structured safely. Enter Unit, Section, and Trade manually.',
      ),
    );
  }

  if (input.positionalInterpretation) {
    flags.push(
      createFlag(
        'positional-interpretation',
        'warning',
        'This unlabeled line was read as Unit | Section | Trade | Crew | Notes. Review it before confirmation.',
      ),
    );
  }
  if (crewName.length > MAX_CREW_LENGTH) {
    flags.push(
      createFlag(
        'invalid-crew',
        'blocking',
        `Crew must be ${MAX_CREW_LENGTH} characters or fewer.`,
        'crewInput',
      ),
    );
  }
  if (notes.length > MAX_NOTES_LENGTH) {
    flags.push(
      createFlag(
        'invalid-notes',
        'blocking',
        `Notes must be ${MAX_NOTES_LENGTH} characters or fewer.`,
        'notesInput',
      ),
    );
  }

  return {
    id: input.id,
    sourceRow: input.sourceRow,
    originalWording: input.originalWording,
    ...(input.sourceCells ? { sourceCells: [...input.sourceCells] } : {}),
    unitInput: input.unitInput,
    ...(unitNumber ? { unitNumber } : {}),
    sectionInput: input.sectionInput,
    ...(section ? { section } : {}),
    tradeInput: input.tradeInput,
    ...(trade ? { trade } : {}),
    crewInput: input.crewInput,
    ...(crewName ? { crewName } : {}),
    notesInput: input.notesInput,
    ...(notes ? { notes } : {}),
    flags,
    corrections: input.corrections ? [...input.corrections] : [],
    reviewState: flags.some((item) => item.severity === 'blocking') ? 'blocked' : 'ready-for-confirmation',
    confirmationState: 'not-confirmed',
  };
};

const relationFlagCodes = new Set<AssignmentIntakeFlag['code']>([
  'duplicate-assignment',
  'assignment-conflict',
]);

const analyzeRecordRelationships = (records: AssignmentIntakeRecord[]) => {
  const next = records.map((record) => ({
    ...record,
    flags: record.flags.filter((item) => !relationFlagCodes.has(item.code)),
  }));
  const groups = new Map<string, AssignmentIntakeRecord[]>();

  next.forEach((record) => {
    if (!record.unitNumber || !record.section || !record.trade) return;
    const key = [
      normalizeKey(record.unitNumber),
      record.section.toLocaleLowerCase('en-US'),
      record.trade.toLocaleLowerCase('en-US'),
    ].join('|');
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  });

  groups.forEach((group) => {
    if (group.length < 2) return;
    const crewKeys = new Set(group.map((record) => normalizeKey(record.crewName ?? '')));
    const isConflict = crewKeys.size > 1;
    const code: AssignmentIntakeFlag['code'] = isConflict ? 'assignment-conflict' : 'duplicate-assignment';
    const message = isConflict
      ? 'Multiple crews claim the same Unit, Section, and Trade. Resolve the conflict before confirmation.'
      : 'This Unit, Section, and Trade appears more than once. Resolve the duplicate before confirmation.';
    const relatedRecordIds = group.map((record) => record.id);

    group.forEach((record) => {
      record.flags = [
        ...record.flags,
        {
          code,
          severity: 'blocking',
          message,
          relatedRecordIds: relatedRecordIds.filter((id) => id !== record.id),
        },
      ];
    });
  });

  return next.map((record) => ({
    ...record,
    reviewState: record.flags.some((item) => item.severity === 'blocking')
      ? ('blocked' as const)
      : ('ready-for-confirmation' as const),
  }));
};

const readMappedCell = (cells: string[], mapping: AssignmentColumnMapping, field: AssignmentColumnField) => {
  const index = mapping[field];
  return index === undefined || index === null ? '' : String(cells[index] ?? '');
};

const buildDelimitedRecords = (
  draftId: string,
  rows: Array<{ cells: string[]; originalWording: string }>,
  mapping: AssignmentColumnMapping,
) =>
  rows.map(({ cells, originalWording }, index) =>
    buildRecord({
      id: `${draftId}:row-${index + 2}`,
      sourceRow: index + 2,
      originalWording,
      sourceCells: cells,
      unitInput: readMappedCell(cells, mapping, 'unit'),
      sectionInput: readMappedCell(cells, mapping, 'section'),
      tradeInput: readMappedCell(cells, mapping, 'trade'),
      crewInput: readMappedCell(cells, mapping, 'crew'),
      notesInput: readMappedCell(cells, mapping, 'notes'),
    }),
  );

const parseLabeledSegment = (segment: string) => {
  const match = segment.match(
    /^(unit(?:\s+(?:number|no))?|apartment|apt|section|room|bedroom|area|trade|service|scope|crew|team|vendor|notes?|comments?)\s*[:#=-]?\s*(.*)$/i,
  );
  if (!match) return undefined;
  const field = HEADER_ALIASES.get(normalizeKey(match[1]));
  return field ? { field, value: match[2] } : undefined;
};

const parseLabeledLine = (draftId: string, originalWording: string, sourceRow: number) => {
  const separated = originalWording.split(/\t|\||;|,/);
  const fields: Record<AssignmentColumnField, string> = {
    unit: '',
    section: '',
    trade: '',
    crew: '',
    notes: '',
  };
  let labeledCount = 0;

  separated.forEach((segment) => {
    const labeled = parseLabeledSegment(segment.trim());
    if (!labeled) return;
    fields[labeled.field] = labeled.value;
    labeledCount += 1;
  });

  if (labeledCount === 0 && separated.length === 1) {
    const unit = originalWording.match(/\b(?:unit|apartment|apt)\s*[:#=-]?\s*([a-z0-9._-]+)/i);
    const section = originalWording.match(/\b(?:section|room|bedroom|area)\s*[:#=-]?\s*(common|[a-z])\b/i);
    const trade = originalWording.match(/\b(?:trade|service|scope)\s*[:#=-]?\s*([a-z]+)\b/i);
    const crew = originalWording.match(/\b(?:crew|team|vendor)\s*[:#=-]?\s*([^,;|]+)$/i);
    fields.unit = unit?.[1] ?? '';
    fields.section = section?.[1] ?? '';
    fields.trade = trade?.[1] ?? '';
    fields.crew = crew?.[1] ?? '';
  }

  const positionalInterpretation = labeledCount === 0 && separated.length >= 3;
  if (positionalInterpretation) {
    fields.unit = separated[0] ?? '';
    fields.section = separated[1] ?? '';
    fields.trade = separated[2] ?? '';
    fields.crew = separated[3] ?? '';
    fields.notes = separated.slice(4).join(',').trim();
  }

  return buildRecord({
    id: `${draftId}:row-${sourceRow}`,
    sourceRow,
    originalWording,
    unitInput: fields.unit,
    sectionInput: fields.section,
    tradeInput: fields.trade,
    crewInput: fields.crew,
    notesInput: fields.notes,
    positionalInterpretation,
  });
};

const buildPasteRecords = (draftId: string, text: string) =>
  text
    .split(/\r?\n/)
    .map((originalWording, index) => ({ originalWording, sourceRow: index + 1 }))
    .filter(({ originalWording }) => originalWording.trim())
    .map(({ originalWording, sourceRow }) => parseLabeledLine(draftId, originalWording, sourceRow));

const validateMapping = (headers: string[], mapping: AssignmentColumnMapping) => {
  const fatalErrors: string[] = [];
  const usedIndexes = new Map<number, AssignmentColumnField>();
  ALL_MAPPING_FIELDS.forEach((field) => {
    const index = mapping[field];
    if (index === undefined || index === null) return;
    if (!Number.isSafeInteger(index) || index < 0 || index >= headers.length) {
      fatalErrors.push(`${field} maps to a column that does not exist.`);
      return;
    }
    const existing = usedIndexes.get(index);
    if (existing) {
      fatalErrors.push(
        `The ${headers[index] || `column ${index + 1}`} column cannot map to both ${existing} and ${field}.`,
      );
      return;
    }
    usedIndexes.set(index, field);
  });
  const missing = REQUIRED_MAPPING_FIELDS.filter((field) => mapping[field] === undefined || mapping[field] === null);
  if (missing.length > 0) {
    fatalErrors.push(`Map the required ${missing.join(', ')} column${missing.length === 1 ? '' : 's'} before review.`);
  }
  return fatalErrors;
};

const isLikelyHeaderPaste = (text: string) => {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const cells = firstLine.split(/\t|\||;|,/);
  const suggested = suggestAssignmentColumnMapping(cells);
  return REQUIRED_MAPPING_FIELDS.every((field) => suggested[field] !== undefined);
};

export interface CreateAssignmentIntakeDraftInput {
  sourceKind: AssignmentIntakeSourceKind;
  text: string;
  sourceLabel?: string;
  attachment?: AssignmentAttachmentMetadata;
  mapping?: AssignmentColumnMapping;
  createdAt?: string;
  draftId?: string;
}

export async function createAssignmentIntakeDraft(
  input: CreateAssignmentIntakeDraftInput,
): Promise<AssignmentIntakeDraft> {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const draftId = input.draftId ?? `assignment-intake-${hashText(`${input.sourceKind}:${input.text}:${createdAt}`)}`;
  const sourceLabel = input.sourceLabel?.trim() || 'Pasted assignment source';
  const source = {
    id: `${draftId}:source`,
    kind: input.sourceKind,
    label: sourceLabel,
    originalText: input.text,
    ...(input.attachment ? { attachment: input.attachment } : {}),
    paperRemainsAuthoritative: true as const,
  };
  const base: Omit<
    AssignmentIntakeDraft,
    'headers' | 'mapping' | 'ignoredHeaders' | 'records' | 'warnings' | 'fatalErrors'
  > = {
    kind: 'assignment-intake-draft',
    id: draftId,
    status: 'draft',
    createdAt,
    source,
    explicitConfirmationRequired: true,
    writesToAppData: false,
  };
  const byteLength = new TextEncoder().encode(input.text).byteLength;
  if (byteLength > ASSIGNMENT_INTAKE_MAX_BYTES) {
    return {
      ...base,
      headers: [],
      mapping: {},
      ignoredHeaders: [],
      records: [],
      warnings: [],
      fatalErrors: [`Source is larger than ${ASSIGNMENT_INTAKE_MAX_BYTES / 1024 / 1024} MB.`],
    };
  }
  if (!input.text.trim()) {
    return {
      ...base,
      headers: [],
      mapping: {},
      ignoredHeaders: [],
      records: [],
      warnings: [],
      fatalErrors: ['Assignment source is empty.'],
    };
  }

  const useDelimitedParser = input.sourceKind !== 'paste-text' || isLikelyHeaderPaste(input.text);
  if (!useDelimitedParser) {
    const records = buildPasteRecords(draftId, input.text);
    const exceedsRowLimit = records.length > ASSIGNMENT_INTAKE_MAX_ROWS;
    return {
      ...base,
      headers: [],
      mapping: {},
      ignoredHeaders: [],
      records: exceedsRowLimit ? [] : analyzeRecordRelationships(records),
      warnings: [],
      fatalErrors: exceedsRowLimit
        ? [`Source has more than ${ASSIGNMENT_INTAKE_MAX_ROWS.toLocaleString()} rows.`]
        : [],
    };
  }

  const parsed = await parseDelimitedInput(input.text);
  const suggestedMapping = suggestAssignmentColumnMapping(parsed.headers);
  const mapping: AssignmentColumnMapping = { ...suggestedMapping };
  ALL_MAPPING_FIELDS.forEach((field) => {
    if (!Object.prototype.hasOwnProperty.call(input.mapping ?? {}, field)) return;
    const override = input.mapping?.[field];
    if (override === undefined || override === null) delete mapping[field];
    else mapping[field] = override;
  });
  const mappingErrors = validateMapping(parsed.headers, mapping);
  const ignoredHeaders = parsed.headers.filter((_, index) => !Object.values(mapping).includes(index));
  const fatalErrors = [...parsed.fatalErrors, ...mappingErrors];
  if (parsed.rows.length > ASSIGNMENT_INTAKE_MAX_ROWS) {
    fatalErrors.push(
      `Source has ${parsed.rows.length.toLocaleString()} rows. The maximum is ${ASSIGNMENT_INTAKE_MAX_ROWS.toLocaleString()}.`,
    );
  }
  const records =
    fatalErrors.length === 0
      ? analyzeRecordRelationships(buildDelimitedRecords(draftId, parsed.rows, mapping))
      : [];

  return {
    ...base,
    headers: parsed.headers,
    mapping,
    ignoredHeaders,
    ...(parsed.delimiter ? { delimiter: parsed.delimiter } : {}),
    records,
    warnings: [
      ...parsed.warnings,
      ...(ignoredHeaders.length > 0
        ? [`Unmapped columns stay out of the draft: ${ignoredHeaders.join(', ')}. The full source remains preserved.`]
        : []),
    ],
    fatalErrors,
  };
}

export interface AssignmentRecordPatch {
  unitInput?: string;
  sectionInput?: string;
  tradeInput?: string;
  crewInput?: string;
  notesInput?: string;
}

export const updateAssignmentDraftRecord = (
  draft: AssignmentIntakeDraft,
  recordId: string,
  patch: AssignmentRecordPatch,
): AssignmentIntakeDraft => {
  const records = draft.records.map((record) => {
    if (record.id !== recordId) return record;
    const corrections = [...record.corrections];
    (Object.keys(patch) as AssignmentEditableField[]).forEach((field) => {
      const nextValue = patch[field];
      if (nextValue === undefined || nextValue === record[field]) return;
      const existingIndex = corrections.findIndex((correction) => correction.field === field);
      if (existingIndex === -1) {
        corrections.push({ field, previousValue: record[field], nextValue });
        return;
      }
      const existing = corrections[existingIndex];
      if (nextValue === existing.previousValue) {
        corrections.splice(existingIndex, 1);
      } else {
        corrections[existingIndex] = { ...existing, nextValue };
      }
    });
    return buildRecord({
      id: record.id,
      sourceRow: record.sourceRow,
      originalWording: record.originalWording,
      ...(record.sourceCells ? { sourceCells: record.sourceCells } : {}),
      unitInput: patch.unitInput ?? record.unitInput,
      sectionInput: patch.sectionInput ?? record.sectionInput,
      tradeInput: patch.tradeInput ?? record.tradeInput,
      crewInput: patch.crewInput ?? record.crewInput,
      notesInput: patch.notesInput ?? record.notesInput,
      corrections,
      positionalInterpretation: record.flags.some((item) => item.code === 'positional-interpretation'),
    });
  });
  return { ...draft, status: 'draft', records: analyzeRecordRelationships(records) };
};

export interface ConfirmAssignmentIntakeRequest {
  recordIds: string[];
  confirmedByLos: boolean;
  confirmedAt?: string;
}

export const confirmAssignmentIntakeDraft = (
  draft: AssignmentIntakeDraft,
  request: ConfirmAssignmentIntakeRequest,
): AssignmentIntakeConfirmationResult => {
  const errors: string[] = [];
  if (!request.confirmedByLos) {
    errors.push('Los must explicitly confirm the reviewed draft.');
  }
  const uniqueIds = [...new Set(request.recordIds)];
  if (uniqueIds.length === 0) {
    errors.push('Select at least one reviewed record.');
  }
  const selected = uniqueIds
    .map((id) => draft.records.find((record) => record.id === id))
    .filter((record): record is AssignmentIntakeRecord => Boolean(record));
  if (selected.length !== uniqueIds.length) {
    errors.push('One or more selected records are no longer present in this draft.');
  }
  selected.forEach((record) => {
    if (record.reviewState !== 'ready-for-confirmation' || !record.unitNumber || !record.section || !record.trade) {
      errors.push(`Row ${record.sourceRow} is blocked and cannot be confirmed.`);
    }
  });
  if (draft.fatalErrors.length > 0) {
    errors.push('Resolve the source or column-mapping errors before confirmation.');
  }
  if (errors.length > 0) {
    return { ok: false, errors: [...new Set(errors)] };
  }

  const confirmedAt = request.confirmedAt ?? new Date().toISOString();
  return {
    ok: true,
    confirmation: {
      kind: 'assignment-intake-confirmation',
      id: `${draft.id}:confirmation-${hashText(`${confirmedAt}:${uniqueIds.join('|')}`)}`,
      draftId: draft.id,
      source: draft.source,
      confirmedAt,
      confirmedBy: 'Los',
      scope: 'personal-candidate-only',
      paperRemainsAuthoritative: true,
      writesToAppData: false,
      records: selected.map((record) => ({
        sourceRecordId: record.id,
        sourceRow: record.sourceRow,
        originalWording: record.originalWording,
        unitNumber: record.unitNumber as string,
        section: record.section as AssignmentIntakeSection,
        trade: record.trade as AssignmentIntakeTrade,
        ...(record.crewName ? { crewName: record.crewName } : {}),
        ...(record.notes ? { notes: record.notes } : {}),
      })),
    },
  };
};
