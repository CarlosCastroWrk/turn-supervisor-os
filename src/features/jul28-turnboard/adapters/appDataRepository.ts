import type { AppData, Project, Unit } from '../../../types';
import {
  JUL28_SECTIONS,
  JUL28_TRADES,
  type Jul28Section,
  type Jul28Trade,
  type Jul28TurnBoardRepository,
  type Jul28UnitRecord,
} from '../model';

export const JUL28_APP_DATA_REPOSITORY_SOURCE = 'personal-turn-os-app-data' as const;

export type Jul28SectionTradeKey = `${Jul28Trade}:${Jul28Section}`;

export const JUL28_APP_DATA_EXPECTED_RECORD_KEYS: readonly Jul28SectionTradeKey[] = Object.freeze(
  JUL28_TRADES.flatMap((trade) =>
    JUL28_SECTIONS.map((section): Jul28SectionTradeKey => `${trade}:${section}`),
  ),
);

export const JUL28_APP_DATA_MISSING_FIELD_TRUTH = [
  'section-applicability',
  'section-authorization',
  'section-access',
  'section-assignment-episodes',
  'section-crew-reported-completion',
  'section-los-inspection',
  'section-property-walk',
  'section-paper-review',
  'section-full-paint',
  'section-fact-provenance',
  'section-history',
] as const;

export type Jul28AppDataMissingFieldTruth =
  (typeof JUL28_APP_DATA_MISSING_FIELD_TRUTH)[number];

export const JUL28_APP_DATA_INTENTIONALLY_UNMAPPED_SOURCES = [
  'unit.hasCommonArea',
  'unit.overallStatus',
  'unit.paintStatus',
  'unit.cleanStatus',
  'unit.repairStatus',
  'unit.flooringStatus',
  'unit.trashStatus',
  'unit.inspectionStatus',
  'unit.assignedCrewIds',
  'unit.notes',
  'assignments',
  'issues',
  'photoNotes',
  'activityLogs',
] as const;

export type Jul28AppDataIntentionallyUnmappedSource =
  (typeof JUL28_APP_DATA_INTENTIONALLY_UNMAPPED_SOURCES)[number];

export type Jul28AppDataMappedField =
  | 'project.id'
  | 'project.mode'
  | 'unit.id'
  | 'unit.projectId'
  | 'unit.unitNumber'
  | 'unit.bedCount'
  | 'building.name'
  | 'floor.name';

export type Jul28AppDataMappingIssue =
  | 'bed-count-invalid'
  | 'building-missing'
  | 'building-ambiguous'
  | 'building-project-mismatch'
  | 'building-name-missing'
  | 'floor-missing'
  | 'floor-ambiguous'
  | 'floor-building-unresolved'
  | 'floor-building-mismatch'
  | 'floor-name-missing';

export interface Jul28AppDataUnitSource {
  readonly kind: 'personal-record';
  readonly repositorySource: typeof JUL28_APP_DATA_REPOSITORY_SOURCE;
  readonly sourceLabel: string;
  readonly projectId: string;
  readonly projectMode: Project['mode'];
  readonly unitId: string;
  readonly sourceUpdatedAt: string | null;
}

export interface Jul28AppDataUnitCoverage {
  readonly state: 'identity-only-source-coverage-incomplete';
  readonly sourceCoverageComplete: false;
  readonly mappedFields: readonly Jul28AppDataMappedField[];
  readonly mappingIssues: readonly Jul28AppDataMappingIssue[];
  readonly missingRecordKeys: readonly Jul28SectionTradeKey[];
  readonly missingFieldTruth: readonly Jul28AppDataMissingFieldTruth[];
  readonly intentionallyUnmappedSources: readonly Jul28AppDataIntentionallyUnmappedSource[];
  readonly reason: string;
}

type DeepReadonly<T> =
  T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

export type Jul28ReadonlyUnitRecord = DeepReadonly<Jul28UnitRecord>;

export type Jul28AppDataUnitRecord = Jul28ReadonlyUnitRecord & {
  readonly adapterSource: Jul28AppDataUnitSource;
  readonly adapterCoverage: Jul28AppDataUnitCoverage;
};

/**
 * This names the existing Wave 1 read surface without claiming its mutable
 * Jul28UnitRecord result is a deeply read-only adapter snapshot.
 */
export type Jul28TurnBoardReadBoundary =
  Pick<Jul28TurnBoardRepository, 'listUnits' | 'getUnit'>;

export interface Jul28ReadonlyTurnBoardReadBoundary<
  TUnit extends Jul28ReadonlyUnitRecord = Jul28ReadonlyUnitRecord,
> {
  readonly listUnits: () => readonly TUnit[];
  readonly getUnit: (unitId: string) => TUnit | undefined;
}

export interface Jul28AppDataTurnBoardRepository
  extends Jul28ReadonlyTurnBoardReadBoundary<Jul28AppDataUnitRecord> {
  readonly source: typeof JUL28_APP_DATA_REPOSITORY_SOURCE;
  readonly sourceKind: 'personal-record';
  readonly sourceLabel: string;
  readonly projectId: string;
  readonly projectMode: Project['mode'];
  readonly officialBoundary: {
    readonly recordAuthority: 'personal-turn-os-record-only';
    readonly officialPaperAuthority: 'unchanged';
    readonly officialSystemWriteEffect: 'none';
    readonly approvalEffect: 'none';
    readonly payrollEffect: 'none';
  };
}

export type Jul28AppDataRepositoryErrorCode =
  | 'active-project-id-missing'
  | 'active-project-not-found'
  | 'active-project-ambiguous'
  | 'active-project-archived'
  | 'unit-identity-missing'
  | 'unit-id-ambiguous'
  | 'unit-number-ambiguous';

export interface Jul28AppDataRepositoryError {
  readonly code: Jul28AppDataRepositoryErrorCode;
  readonly message: string;
  readonly details: readonly string[];
}

export type Jul28AppDataRepositoryResult =
  | {
      readonly ok: true;
      readonly repository: Jul28AppDataTurnBoardRepository;
    }
  | {
      readonly ok: false;
      readonly error: Jul28AppDataRepositoryError;
    };

const UNKNOWN_BUILDING_LABEL = 'Building unknown — AppData link missing or ambiguous';
const UNKNOWN_FLOOR_LABEL = 'Floor unknown — AppData link missing or ambiguous';
const UNKNOWN_UNIT_TYPE_LABEL = 'Bed count unknown in AppData';

const sourceLabelFor = (mode: Project['mode']) =>
  mode === 'demo'
    ? 'Personal Turn OS Demo Mode AppData records'
    : 'Personal Turn OS Real Turn AppData records';

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
};

const failure = (
  code: Jul28AppDataRepositoryErrorCode,
  message: string,
  details: readonly string[] = [],
): Jul28AppDataRepositoryResult => deepFreeze({
  ok: false,
  error: {
    code,
    message,
    details: [...details],
  },
});

const duplicateValues = (
  values: readonly string[],
  normalize: (value: string) => string = (value) => value,
) => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    const normalized = normalize(value);
    if (seen.has(normalized)) duplicates.add(normalized);
    seen.add(normalized);
  }
  return [...duplicates].sort();
};

interface LocationMapping {
  readonly buildingLabel: string;
  readonly floorLabel: string;
  readonly mappedFields: readonly Jul28AppDataMappedField[];
  readonly issues: readonly Jul28AppDataMappingIssue[];
}

const mapLocation = (
  data: Readonly<AppData>,
  project: Project,
  unit: Unit,
): LocationMapping => {
  const issues: Jul28AppDataMappingIssue[] = [];
  const mappedFields: Jul28AppDataMappedField[] = [];
  const buildingIdMatches = data.buildings.filter((building) => building.id === unit.buildingId);

  let buildingLabel = UNKNOWN_BUILDING_LABEL;
  let buildingIdentityResolved = false;
  if (buildingIdMatches.length > 1) {
    issues.push('building-ambiguous');
  } else if (buildingIdMatches.length === 0) {
    issues.push('building-missing');
  } else if (buildingIdMatches[0]?.projectId !== project.id) {
    issues.push('building-project-mismatch');
  } else {
    buildingIdentityResolved = true;
    if (!buildingIdMatches[0].name.trim()) {
      issues.push('building-name-missing');
    } else {
      buildingLabel = buildingIdMatches[0].name;
      mappedFields.push('building.name');
    }
  }

  const floorMatches = data.floors.filter((floor) => floor.id === unit.floorId);
  let floorLabel = UNKNOWN_FLOOR_LABEL;
  if (floorMatches.length > 1) {
    issues.push('floor-ambiguous');
  } else if (floorMatches.length === 0) {
    issues.push('floor-missing');
  } else if (floorMatches[0]?.buildingId !== unit.buildingId) {
    issues.push('floor-building-mismatch');
  } else if (!buildingIdentityResolved) {
    issues.push('floor-building-unresolved');
  } else if (!floorMatches[0].name.trim()) {
    issues.push('floor-name-missing');
  } else {
    floorLabel = floorMatches[0].name;
    mappedFields.push('floor.name');
  }

  return {
    buildingLabel,
    floorLabel,
    mappedFields,
    issues,
  };
};

const mapUnit = (
  data: Readonly<AppData>,
  project: Project,
  unit: Unit,
  sourceLabel: string,
): Jul28AppDataUnitRecord => {
  const location = mapLocation(data, project, unit);
  const mappedFields: Jul28AppDataMappedField[] = [
    'project.id',
    'project.mode',
    'unit.id',
    'unit.projectId',
    'unit.unitNumber',
    ...location.mappedFields,
  ];
  const mappingIssues = [...location.issues];
  const bedCountIsRecorded = Number.isInteger(unit.bedCount) && unit.bedCount >= 0;
  if (bedCountIsRecorded) {
    mappedFields.push('unit.bedCount');
  } else {
    mappingIssues.push('bed-count-invalid');
  }

  return {
    id: unit.id,
    unitNumber: unit.unitNumber,
    unitTypeLabel: bedCountIsRecorded
      ? `${unit.bedCount} bed${unit.bedCount === 1 ? '' : 's'} recorded in AppData`
      : UNKNOWN_UNIT_TYPE_LABEL,
    buildingLabel: location.buildingLabel,
    floorLabel: location.floorLabel,
    sectionOrder: [...JUL28_SECTIONS],
    records: [],
    adapterSource: {
      kind: 'personal-record',
      repositorySource: JUL28_APP_DATA_REPOSITORY_SOURCE,
      sourceLabel,
      projectId: project.id,
      projectMode: project.mode,
      unitId: unit.id,
      sourceUpdatedAt: unit.updatedAt.trim() ? unit.updatedAt : null,
    },
    adapterCoverage: {
      state: 'identity-only-source-coverage-incomplete',
      sourceCoverageComplete: false,
      mappedFields,
      mappingIssues,
      missingRecordKeys: [...JUL28_APP_DATA_EXPECTED_RECORD_KEYS],
      missingFieldTruth: [...JUL28_APP_DATA_MISSING_FIELD_TRUTH],
      intentionallyUnmappedSources: [...JUL28_APP_DATA_INTENTIONALLY_UNMAPPED_SOURCES],
      reason: 'AppData has whole-Unit summaries, not authoritative section-level Paint/Clean facts with personal-record provenance.',
    },
  };
};

export const createJul28AppDataTurnBoardRepository = (
  data: Readonly<AppData>,
): Jul28AppDataRepositoryResult => {
  if (!data.activeProjectId.trim()) {
    return failure(
      'active-project-id-missing',
      'The AppData snapshot has no active project ID. No TurnBoard repository was created.',
    );
  }

  const projectMatches = data.projects.filter((project) => project.id === data.activeProjectId);
  if (projectMatches.length === 0) {
    return failure(
      'active-project-not-found',
      'The active AppData project does not exist. No TurnBoard repository was created.',
      [data.activeProjectId],
    );
  }
  if (projectMatches.length > 1) {
    return failure(
      'active-project-ambiguous',
      'More than one AppData project matches the active project ID. No TurnBoard repository was created.',
      [data.activeProjectId],
    );
  }

  const project = projectMatches[0];
  if (!project) {
    return failure(
      'active-project-not-found',
      'The active AppData project does not exist. No TurnBoard repository was created.',
      [data.activeProjectId],
    );
  }
  // A SEALED (Close Turn) real project stays fully browsable — the board is
  // the saved record. The archived guard predates Close Turn (Aug 2026) and
  // used to block the whole TurnBoard on Los's sealed Moon Tower; writes are
  // refused at the host commit gate instead, so reading here is safe.

  const activeUnits = data.units.filter((unit) => unit.projectId === project.id);
  const unitsWithMissingIdentity = activeUnits
    .filter((unit) => !unit.id.trim() || !unit.unitNumber.trim())
    .map((unit) => unit.id || '(missing unit id)');
  if (unitsWithMissingIdentity.length > 0) {
    return failure(
      'unit-identity-missing',
      'At least one active-project Unit lacks a stable ID or Unit number. No TurnBoard repository was created.',
      unitsWithMissingIdentity,
    );
  }

  const duplicateUnitIds = duplicateValues(activeUnits.map((unit) => unit.id));
  if (duplicateUnitIds.length > 0) {
    return failure(
      'unit-id-ambiguous',
      'The active project contains duplicate Unit IDs. No TurnBoard repository was created.',
      duplicateUnitIds,
    );
  }

  const duplicateUnitNumbers = duplicateValues(
    activeUnits.map((unit) => unit.unitNumber),
    (value) => value.trim().toLocaleLowerCase(),
  );
  if (duplicateUnitNumbers.length > 0) {
    return failure(
      'unit-number-ambiguous',
      'The active project contains ambiguous Unit numbers. No TurnBoard repository was created.',
      duplicateUnitNumbers,
    );
  }

  const sourceLabel = sourceLabelFor(project.mode);
  const units: readonly Jul28AppDataUnitRecord[] = deepFreeze(
    activeUnits.map((unit) => mapUnit(data, project, unit, sourceLabel)),
  );
  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const repository: Jul28AppDataTurnBoardRepository = {
    source: JUL28_APP_DATA_REPOSITORY_SOURCE,
    sourceKind: 'personal-record',
    sourceLabel,
    projectId: project.id,
    projectMode: project.mode,
    officialBoundary: {
      recordAuthority: 'personal-turn-os-record-only',
      officialPaperAuthority: 'unchanged',
      officialSystemWriteEffect: 'none',
      approvalEffect: 'none',
      payrollEffect: 'none',
    },
    listUnits: () => units,
    getUnit: (unitId) => unitById.get(unitId),
  };

  return deepFreeze({ ok: true, repository });
};
