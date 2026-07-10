export const UNIT_CSV_MAX_BYTES = 2 * 1024 * 1024;
export const UNIT_CSV_MAX_ROWS = 5_000;
export const UNIT_CSV_TEMPLATE_FILENAME = 'turn-unit-import-template.csv';

const MAX_HEADERS = 50;
const MAX_UNIT_NUMBER_LENGTH = 40;
const MAX_LOCATION_NAME_LENGTH = 120;
const MAX_NOTES_LENGTH = 2_000;
const MAX_BEDS_OR_BATHROOMS = 50;

type UnitCsvHeader = 'unitNumber' | 'buildingName' | 'floorName' | 'bedCount' | 'bathroomCount' | 'hasCommonArea' | 'notes';

const HEADER_ALIASES = new Map<string, UnitCsvHeader>([
  ['unit', 'unitNumber'],
  ['unit number', 'unitNumber'],
  ['apartment', 'unitNumber'],
  ['apartment number', 'unitNumber'],
  ['apt', 'unitNumber'],
  ['apt number', 'unitNumber'],
  ['room', 'unitNumber'],
  ['room number', 'unitNumber'],
  ['building', 'buildingName'],
  ['building name', 'buildingName'],
  ['bldg', 'buildingName'],
  ['bldg name', 'buildingName'],
  ['floor', 'floorName'],
  ['floor name', 'floorName'],
  ['level', 'floorName'],
  ['level name', 'floorName'],
  ['beds', 'bedCount'],
  ['bed', 'bedCount'],
  ['bed count', 'bedCount'],
  ['bedroom', 'bedCount'],
  ['bedrooms', 'bedCount'],
  ['bedroom count', 'bedCount'],
  ['bathrooms', 'bathroomCount'],
  ['bathroom', 'bathroomCount'],
  ['baths', 'bathroomCount'],
  ['bath', 'bathroomCount'],
  ['bath count', 'bathroomCount'],
  ['bathroom count', 'bathroomCount'],
  ['common area', 'hasCommonArea'],
  ['has common area', 'hasCommonArea'],
  ['common', 'hasCommonArea'],
  ['notes', 'notes'],
  ['note', 'notes'],
  ['unit notes', 'notes'],
  ['comments', 'notes'],
  ['comment', 'notes'],
]);

const STATUS_HEADER_PATTERN = /(^| )(status|paint|painting|clean|cleaning|repair|inspection|flooring|trash)( |$)/i;

export interface UnitCsvRow {
  sourceRow: number;
  unitNumber: string;
  buildingName?: string;
  floorName?: string;
  bedCount: number;
  bathroomCount: number;
  hasCommonArea: boolean;
  notes: string;
}

export interface UnitCsvRowMessage {
  sourceRow: number;
  unitNumber?: string;
  message: string;
}

export interface UnitCsvParseResult {
  rows: UnitCsvRow[];
  skippedExisting: UnitCsvRowMessage[];
  rowErrors: UnitCsvRowMessage[];
  fatalErrors: string[];
  warnings: string[];
  totalDataRows: number;
  headers: string[];
}

export interface ParseUnitCsvOptions {
  existingUnitNumbers?: Iterable<string>;
}

const normalizeHeader = (value: string) =>
  value
    .replace(/^\ufeff/, '')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/#/g, ' number ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const normalizeShortText = (value: string) => value.trim().replace(/\s+/g, ' ');

export const normalizeUnitNumberKey = (value: string) =>
  normalizeShortText(value).normalize('NFKC').toLocaleLowerCase('en-US');

const hasUnsafeControlCharacters = (value: string) =>
  Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code === 127 || (code >= 0 && code <= 31 && code !== 9 && code !== 10 && code !== 13);
  });

type ParsedValue<T> = { ok: true; value: T } | { ok: false; error: string };

const parseCount = (value: string, label: string): ParsedValue<number> => {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: true, value: 0 };
  }
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, error: `${label} must be a whole number from 0 to ${MAX_BEDS_OR_BATHROOMS}.` };
  }
  const count = Number(trimmed);
  if (!Number.isSafeInteger(count) || count < 0 || count > MAX_BEDS_OR_BATHROOMS) {
    return { ok: false, error: `${label} must be a whole number from 0 to ${MAX_BEDS_OR_BATHROOMS}.` };
  }
  return { ok: true, value: count };
};

const parseBoolean = (value: string): ParsedValue<boolean> => {
  const normalized = value.trim().toLocaleLowerCase('en-US');
  if (!normalized || ['no', 'n', 'false', '0'].includes(normalized)) {
    return { ok: true, value: false };
  }
  if (['yes', 'y', 'true', '1', 'x'].includes(normalized)) {
    return { ok: true, value: true };
  }
  return { ok: false, error: 'Common area must be yes/no, true/false, or 1/0.' };
};

const validateText = (value: string, label: string, maxLength: number, required = false) => {
  if (required && !value) {
    return `${label} is required.`;
  }
  if (value.length > maxLength) {
    return `${label} must be ${maxLength} characters or fewer.`;
  }
  if (hasUnsafeControlCharacters(value)) {
    return `${label} contains unsupported control characters.`;
  }
  return undefined;
};

export const normalizeUnitCsvImportRow = (value: unknown): UnitCsvRow | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const candidate = value as Partial<UnitCsvRow>;
  if (
    !Number.isSafeInteger(candidate.sourceRow) ||
    Number(candidate.sourceRow) < 1 ||
    typeof candidate.unitNumber !== 'string' ||
    typeof candidate.notes !== 'string' ||
    typeof candidate.bedCount !== 'number' ||
    typeof candidate.bathroomCount !== 'number' ||
    typeof candidate.hasCommonArea !== 'boolean' ||
    (candidate.buildingName !== undefined && typeof candidate.buildingName !== 'string') ||
    (candidate.floorName !== undefined && typeof candidate.floorName !== 'string')
  ) {
    return undefined;
  }

  const unitNumber = normalizeShortText(candidate.unitNumber);
  const buildingName = candidate.buildingName ? normalizeShortText(candidate.buildingName) : undefined;
  const floorName = candidate.floorName ? normalizeShortText(candidate.floorName) : undefined;
  const notes = candidate.notes.trim();
  if (
    validateText(unitNumber, 'Unit', MAX_UNIT_NUMBER_LENGTH, true) ||
    validateText(buildingName ?? '', 'Building', MAX_LOCATION_NAME_LENGTH) ||
    validateText(floorName ?? '', 'Floor', MAX_LOCATION_NAME_LENGTH) ||
    validateText(notes, 'Notes', MAX_NOTES_LENGTH) ||
    !Number.isSafeInteger(candidate.bedCount) ||
    candidate.bedCount < 0 ||
    candidate.bedCount > MAX_BEDS_OR_BATHROOMS ||
    !Number.isSafeInteger(candidate.bathroomCount) ||
    candidate.bathroomCount < 0 ||
    candidate.bathroomCount > MAX_BEDS_OR_BATHROOMS
  ) {
    return undefined;
  }

  return {
    sourceRow: Number(candidate.sourceRow),
    unitNumber,
    ...(buildingName ? { buildingName } : {}),
    ...(floorName ? { floorName } : {}),
    bedCount: candidate.bedCount,
    bathroomCount: candidate.bathroomCount,
    hasCommonArea: candidate.hasCommonArea,
    notes,
  };
};

const emptyResult = (fatalErrors: string[] = []): UnitCsvParseResult => ({
  rows: [],
  skippedExisting: [],
  rowErrors: [],
  fatalErrors,
  warnings: [],
  totalDataRows: 0,
  headers: [],
});

export async function parseUnitCsv(text: string, options: ParseUnitCsvOptions = {}): Promise<UnitCsvParseResult> {
  const byteLength = new TextEncoder().encode(text).byteLength;
  if (byteLength > UNIT_CSV_MAX_BYTES) {
    return emptyResult([`CSV is larger than ${UNIT_CSV_MAX_BYTES / 1024 / 1024} MB.`]);
  }
  if (!text.trim()) {
    return emptyResult(['CSV is empty.']);
  }

  const { default: Papa } = await import('papaparse');
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy' });
  const delimiterWarnings = parsed.errors.filter((error) => error.code === 'UndetectableDelimiter');
  const parseErrors = parsed.errors.filter((error) => error.code !== 'UndetectableDelimiter');
  if (parseErrors.length > 0) {
    return emptyResult(
      parseErrors.slice(0, 5).map((error) => {
        const row = typeof error.row === 'number' ? ` near record ${error.row + 1}` : '';
        return `CSV could not be parsed${row}: ${error.message}`;
      }),
    );
  }

  const records = parsed.data.map((record) => record.map((cell) => String(cell ?? '')));
  if (records.length === 0) {
    return emptyResult(['CSV does not contain a header row.']);
  }

  const headers = records[0].map((header) => header.replace(/^\ufeff/, '').trim());
  const totalDataRows = Math.max(0, records.length - 1);
  const result: UnitCsvParseResult = {
    rows: [],
    skippedExisting: [],
    rowErrors: [],
    fatalErrors: [],
    warnings: delimiterWarnings.length > 0 ? ['No delimiter was detected; the file was read as a single-column CSV.'] : [],
    totalDataRows,
    headers,
  };

  if (headers.length > MAX_HEADERS) {
    result.fatalErrors.push(`CSV has too many columns. The maximum is ${MAX_HEADERS}.`);
  }
  if (totalDataRows > UNIT_CSV_MAX_ROWS) {
    result.fatalErrors.push(`CSV has ${totalDataRows.toLocaleString()} rows. The maximum is ${UNIT_CSV_MAX_ROWS.toLocaleString()}.`);
  }

  const headerIndexes = new Map<UnitCsvHeader, number>();
  const ignoredHeaders: string[] = [];
  const ignoredStatusHeaders: string[] = [];
  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    const canonical = HEADER_ALIASES.get(normalized);
    if (!canonical) {
      const hasValues = records.slice(1).some((record) => String(record[index] ?? '').trim());
      if (normalized || hasValues) {
        const label = header || `Blank column ${index + 1}`;
        ignoredHeaders.push(label);
        if (STATUS_HEADER_PATTERN.test(normalized)) {
          ignoredStatusHeaders.push(label);
        }
      }
      return;
    }
    if (headerIndexes.has(canonical)) {
      result.fatalErrors.push(`CSV maps more than one column to ${canonical === 'unitNumber' ? 'Unit' : header}. Keep only one.`);
      return;
    }
    headerIndexes.set(canonical, index);
  });

  if (!headerIndexes.has('unitNumber')) {
    result.fatalErrors.push('CSV needs a Unit column. Unit Number, Apartment, Apt, and Room also work.');
  }
  const ignoredStatusHeaderSet = new Set(ignoredStatusHeaders);
  const ignoredNonStatusHeaders = ignoredHeaders.filter((header) => !ignoredStatusHeaderSet.has(header));
  if (ignoredNonStatusHeaders.length > 0) {
    const visible = ignoredNonStatusHeaders.slice(0, 8).join(', ');
    const remaining = ignoredNonStatusHeaders.length > 8 ? ` and ${ignoredNonStatusHeaders.length - 8} more` : '';
    result.warnings.push(
      `Ignored column${ignoredNonStatusHeaders.length === 1 ? '' : 's'}: ${visible}${remaining}.`,
    );
  }
  if (ignoredStatusHeaders.length > 0) {
    result.warnings.push('Status columns are ignored. Every imported unit starts Not Started for field safety.');
  }
  if (text.includes('\ufffd')) {
    result.warnings.push('Some characters could not be decoded. Review names and notes before importing.');
  }
  if (result.fatalErrors.length > 0) {
    return result;
  }

  const existingKeys = new Set(
    Array.from(options.existingUnitNumbers ?? [], (unitNumber) => normalizeUnitNumberKey(unitNumber)).filter(Boolean),
  );
  const seenKeys = new Set<string>();
  const read = (record: string[], header: UnitCsvHeader) => {
    const index = headerIndexes.get(header);
    return index === undefined ? '' : String(record[index] ?? '');
  };

  records.slice(1).forEach((record, index) => {
    const sourceRow = index + 2;
    const unitNumber = normalizeShortText(read(record, 'unitNumber'));
    const buildingName = normalizeShortText(read(record, 'buildingName'));
    const floorName = normalizeShortText(read(record, 'floorName'));
    const notes = read(record, 'notes').trim();
    const rowMessages: string[] = [];
    const extraValues = record.slice(headers.length).filter((cell) => String(cell).trim());
    if (extraValues.length > 0) {
      rowMessages.push('Row has values beyond the named columns.');
    }
    const unitError = validateText(unitNumber, 'Unit', MAX_UNIT_NUMBER_LENGTH, true);
    const buildingError = validateText(buildingName, 'Building', MAX_LOCATION_NAME_LENGTH);
    const floorError = validateText(floorName, 'Floor', MAX_LOCATION_NAME_LENGTH);
    const notesError = validateText(notes, 'Notes', MAX_NOTES_LENGTH);
    for (const message of [unitError, buildingError, floorError, notesError]) {
      if (message) rowMessages.push(message);
    }
    const beds = parseCount(read(record, 'bedCount'), 'Beds');
    const bathrooms = parseCount(read(record, 'bathroomCount'), 'Bathrooms');
    const commonArea = parseBoolean(read(record, 'hasCommonArea'));
    if (!beds.ok) rowMessages.push(beds.error);
    if (!bathrooms.ok) rowMessages.push(bathrooms.error);
    if (!commonArea.ok) rowMessages.push(commonArea.error);
    if (rowMessages.length > 0 || !beds.ok || !bathrooms.ok || !commonArea.ok) {
      result.rowErrors.push({ sourceRow, ...(unitNumber ? { unitNumber } : {}), message: rowMessages.join(' ') });
      return;
    }

    const row: UnitCsvRow = {
      sourceRow,
      unitNumber,
      ...(buildingName ? { buildingName } : {}),
      ...(floorName ? { floorName } : {}),
      bedCount: beds.value,
      bathroomCount: bathrooms.value,
      hasCommonArea: commonArea.value,
      notes,
    };
    const key = normalizeUnitNumberKey(unitNumber);
    if (seenKeys.has(key)) {
      result.rowErrors.push({ sourceRow, unitNumber, message: `Duplicate Unit ${unitNumber} in this file; the first row was kept.` });
      return;
    }
    seenKeys.add(key);
    if (existingKeys.has(key)) {
      result.skippedExisting.push({ sourceRow, unitNumber, message: `Unit ${unitNumber} already exists and will not change.` });
      return;
    }
    result.rows.push(row);
  });

  if (totalDataRows === 0) {
    result.warnings.push('CSV has headers but no unit rows.');
  }
  return result;
}

export const buildUnitCsvTemplate = () => 'unit,building,floor,beds,bathrooms,common_area,notes\r\n';
