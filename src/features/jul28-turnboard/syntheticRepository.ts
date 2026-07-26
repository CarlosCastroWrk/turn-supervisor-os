import {
  JUL28_SECTIONS,
  JUL28_TRADES,
  type Jul28AssignmentEpisode,
  type Jul28HistoryEvent,
  type Jul28Section,
  type Jul28SectionTradeRecord,
  type Jul28Trade,
  type Jul28TurnBoardRepository,
  type Jul28UnitRecord,
} from './model';

type RecordOverrides = Partial<Omit<Jul28SectionTradeRecord, 'id' | 'unitId' | 'trade' | 'section' | 'history'>> & {
  history?: Jul28HistoryEvent[];
};

const at = (day: number, hour: number, minute = 0) =>
  `2026-07-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`;

const episode = (
  id: string,
  kind: Jul28AssignmentEpisode['kind'],
  crewName: string,
  recordedAt: string,
  wording: string,
  active = true,
): Jul28AssignmentEpisode => ({
  id,
  kind,
  crewName,
  sourceLabel: 'Synthetic assignment evidence',
  recordedAt,
  active,
  wording,
});

const createHistory = (
  recordId: string,
  overrides: RecordOverrides,
): Jul28HistoryEvent[] => {
  const assignmentHistory = (overrides.assignmentEpisodes ?? []).map((assignment) => ({
    id: `${recordId}:assignment:${assignment.id}`,
    kind: 'assignment' as const,
    recordedAt: assignment.recordedAt,
    title: assignment.kind === 'added-scope' ? 'Added scope recorded' : 'Assignment evidence recorded',
    wording: assignment.wording,
    sourceLabel: assignment.sourceLabel,
  }));

  const accessHistory: Jul28HistoryEvent[] = overrides.access && overrides.access !== 'accessible'
    ? [{
        id: `${recordId}:access`,
        kind: 'access',
        recordedAt: overrides.updatedAt ?? at(21, 8),
        title: 'Access or restriction recorded',
        wording: overrides.restrictionLabel ?? 'Access requires clarification before entry.',
        sourceLabel: 'Synthetic personal observation',
      }]
    : [];

  const crewHistory: Jul28HistoryEvent[] = overrides.crewExecution === 'crew-reported-complete'
    ? [{
        id: `${recordId}:crew-report`,
        kind: 'crew-report',
        recordedAt: overrides.updatedAt ?? at(21, 10),
        title: 'Crew reported complete',
        wording: 'Crew report recorded. This is not Los inspection or property acceptance.',
        sourceLabel: 'Synthetic crew report',
      }]
    : [];

  const inspectionHistory: Jul28HistoryEvent[] = overrides.inspection === 'los-passed' || overrides.inspection === 'passed-after-callback'
    ? [{
        id: `${recordId}:inspection`,
        kind: 'los-inspection',
        recordedAt: overrides.updatedAt ?? at(21, 11),
        title: overrides.inspection === 'passed-after-callback' ? 'Passed after callback' : 'Los inspection recorded',
        wording: 'Personal supervisor inspection recorded. Property walk and paper review remain separate.',
        sourceLabel: 'Synthetic personal inspection',
      }]
    : [];

  const paperHistory: Jul28HistoryEvent[] = overrides.paperReview === 'paper-reviewed'
    ? [{
        id: `${recordId}:paper-review`,
        kind: 'paper-review',
        recordedAt: overrides.updatedAt ?? at(21, 12),
        title: 'Personal paper review recorded',
        wording: 'Personal notes checked against paper. This is not an official board or payroll action.',
        sourceLabel: 'Synthetic personal reconciliation',
      }]
    : [];

  return [
    ...assignmentHistory,
    ...accessHistory,
    ...crewHistory,
    ...inspectionHistory,
    ...paperHistory,
    ...(overrides.history ?? []),
  ].sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
};

const record = (
  unitId: string,
  trade: Jul28Trade,
  section: Jul28Section,
  overrides: RecordOverrides = {},
): Jul28SectionTradeRecord => {
  const id = `${unitId}:${trade}:${section}`;
  const values: RecordOverrides = {
    applicability: 'applicable',
    authorization: 'not-released',
    access: 'accessible',
    assignmentEpisodes: [],
    crewExecution: 'unassigned',
    inspection: 'inspection-pending',
    propertyWalk: 'walk-not-ready',
    paperReview: 'needs-paper-review',
    fullPaint: false,
    updatedAt: at(20, 8),
    ...overrides,
  };

  return {
    id,
    unitId,
    trade,
    section,
    applicability: values.applicability ?? 'applicable',
    authorization: values.authorization ?? 'not-released',
    access: values.access ?? 'accessible',
    assignmentEpisodes: values.assignmentEpisodes ?? [],
    crewExecution: values.crewExecution ?? 'unassigned',
    inspection: values.inspection ?? 'inspection-pending',
    propertyWalk: values.propertyWalk ?? 'walk-not-ready',
    paperReview: values.paperReview ?? 'needs-paper-review',
    fullPaint: values.fullPaint ?? false,
    restrictionLabel: values.restrictionLabel,
    updatedAt: values.updatedAt ?? at(20, 8),
    history: createHistory(id, values),
  };
};

const notApplicable = (unitId: string, trade: Jul28Trade, section: Jul28Section) =>
  record(unitId, trade, section, {
    applicability: 'not-applicable',
    updatedAt: at(20, 7),
  });

const createUnit = (
  id: string,
  unitNumber: string,
  buildingLabel: string,
  floorLabel: string,
  records: Jul28SectionTradeRecord[],
): Jul28UnitRecord => ({
  id,
  unitNumber,
  buildingLabel,
  floorLabel,
  sectionOrder: [...JUL28_SECTIONS],
  records,
});

const unit602 = createUnit('jul28-unit-602', '602', 'Building A', 'Level 06', [
  record('jul28-unit-602', 'paint', 'common', {
    authorization: 'released',
    assignmentEpisodes: [episode('602-p-common', 'initial', 'Bluebird Paint', at(20, 8, 12), 'Original Paint scope recorded from synthetic assignment evidence.')],
    crewExecution: 'crew-reported-complete',
    inspection: 'inspection-pending',
    propertyWalk: 'walk-not-ready',
    updatedAt: at(21, 9, 5),
  }),
  record('jul28-unit-602', 'paint', 'A', {
    authorization: 'released',
    assignmentEpisodes: [episode('602-p-a', 'initial', 'Bluebird Paint', at(20, 8, 12), 'Original Paint scope recorded from synthetic assignment evidence.')],
    crewExecution: 'crew-reported-complete',
    inspection: 'inspection-pending',
    updatedAt: at(21, 9, 5),
  }),
  record('jul28-unit-602', 'paint', 'B', {
    authorization: 'not-released',
    access: 'occupied-or-restricted',
    restrictionLabel: 'Restricted — do not enter until assignment and access are clarified.',
    updatedAt: at(21, 8, 15),
  }),
  record('jul28-unit-602', 'paint', 'C', {
    authorization: 'released',
    assignmentEpisodes: [episode('602-p-c', 'initial', 'Bluebird Paint', at(20, 8, 12), 'Original Paint scope recorded from synthetic assignment evidence.')],
    crewExecution: 'crew-reported-complete',
    inspection: 'inspection-pending',
    updatedAt: at(21, 9, 5),
  }),
  record('jul28-unit-602', 'paint', 'D', {
    authorization: 'released',
    assignmentEpisodes: [episode('602-p-d', 'added-scope', 'Bluebird Paint', at(21, 10, 20), 'Added scope recorded as a new assignment episode; it is not an original crew miss.')],
    crewExecution: 'working',
    inspection: 'inspection-pending',
    updatedAt: at(21, 10, 20),
  }),
  notApplicable('jul28-unit-602', 'paint', 'E'),
  record('jul28-unit-602', 'clean', 'common', {
    authorization: 'released',
    assignmentEpisodes: [episode('602-c-common', 'initial', 'Cedar Clean', at(21, 11), 'Clean scope recorded independently from Paint.')],
    crewExecution: 'working',
    updatedAt: at(21, 11),
  }),
  record('jul28-unit-602', 'clean', 'A', {
    authorization: 'released',
    assignmentEpisodes: [episode('602-c-a', 'initial', 'Cedar Clean', at(21, 11), 'Clean scope recorded independently from Paint.')],
    crewExecution: 'assigned',
    updatedAt: at(21, 11),
  }),
  record('jul28-unit-602', 'clean', 'B', {
    authorization: 'not-released',
    access: 'occupied-or-restricted',
    restrictionLabel: 'Restricted — do not enter until assignment and access are clarified.',
    updatedAt: at(21, 8, 15),
  }),
  record('jul28-unit-602', 'clean', 'C', {
    authorization: 'released',
    assignmentEpisodes: [episode('602-c-c', 'initial', 'Cedar Clean', at(21, 11), 'Clean scope recorded independently from Paint.')],
    crewExecution: 'assigned',
    updatedAt: at(21, 11),
  }),
  record('jul28-unit-602', 'clean', 'D', { authorization: 'not-released', updatedAt: at(21, 11) }),
  notApplicable('jul28-unit-602', 'clean', 'E'),
]);

const unit603 = createUnit('jul28-unit-603', '603', 'Building A', 'Level 06', [
  ...(['common', 'A', 'B', 'D'] as Jul28Section[]).map((section) => record('jul28-unit-603', 'paint', section, {
    authorization: 'released',
    assignmentEpisodes: [episode(`603-p-${section}`, 'initial', 'Northline Paint', at(20, 8, 20), 'Paint assignment evidence recorded.')],
    crewExecution: 'crew-reported-complete',
    inspection: 'inspection-pending',
    propertyWalk: 'walk-not-ready',
    updatedAt: at(21, 14, 40),
  })),
  record('jul28-unit-603', 'paint', 'C', {
    authorization: 'released',
    access: 'occupied-or-restricted',
    assignmentEpisodes: [episode('603-p-c', 'initial', 'Northline Paint', at(20, 8, 20), 'Full Paint scope recorded for section C.')],
    crewExecution: 'crew-reported-complete',
    inspection: 'inspection-pending',
    propertyWalk: 'walk-not-ready',
    fullPaint: true,
    restrictionLabel: 'Crew report exists, but access is restricted; Los inspection is still pending.',
    updatedAt: at(21, 14, 40),
  }),
  notApplicable('jul28-unit-603', 'paint', 'E'),
  ...(['common', 'A', 'B', 'D'] as Jul28Section[]).map((section) => record('jul28-unit-603', 'clean', section, {
    authorization: 'released',
    assignmentEpisodes: [episode(`603-c-${section}`, 'initial', 'Cedar Clean', at(21, 15), 'Clean assignment evidence recorded independently.')],
    crewExecution: 'working',
    updatedAt: at(21, 15),
  })),
  record('jul28-unit-603', 'clean', 'C', {
    authorization: 'released',
    access: 'occupied-or-restricted',
    assignmentEpisodes: [episode('603-c-c', 'initial', 'Cedar Clean', at(21, 15), 'Clean assignment evidence recorded independently.')],
    crewExecution: 'assigned',
    restrictionLabel: 'Restricted access remains separate from Clean assignment evidence.',
    updatedAt: at(21, 15),
  }),
  notApplicable('jul28-unit-603', 'clean', 'E'),
]);

const unit604 = createUnit('jul28-unit-604', '604', 'Building A', 'Level 06', [
  ...(['common', 'A'] as Jul28Section[]).map((section) => record('jul28-unit-604', 'paint', section, {
    authorization: 'released',
    assignmentEpisodes: [episode(`604-p-${section}`, 'initial', 'Atlas Paint', at(19, 8, 35), 'Paint assignment evidence recorded.')],
    crewExecution: 'crew-reported-complete',
    inspection: 'los-passed',
    propertyWalk: 'walk-pending',
    updatedAt: at(20, 10, 10),
  })),
  notApplicable('jul28-unit-604', 'paint', 'B'),
  record('jul28-unit-604', 'paint', 'C', {
    authorization: 'assignment-conflict',
    access: 'occupied-or-restricted',
    assignmentEpisodes: [
      episode('604-p-c-1', 'initial', 'Atlas Paint', at(20, 8, 5), 'First active crew claim recorded from synthetic assignment evidence.'),
      episode('604-p-c-2', 'reassignment', 'Bluebird Paint', at(20, 8, 15), 'Second active crew claim conflicts with the first; neither claim wins automatically.'),
    ],
    crewExecution: 'assigned',
    restrictionLabel: 'Assignment evidence and access observation conflict. Authorization remains unresolved.',
    updatedAt: at(20, 8, 15),
  }),
  record('jul28-unit-604', 'paint', 'D', {
    authorization: 'released',
    assignmentEpisodes: [episode('604-p-d', 'initial', 'Atlas Paint', at(20, 8, 35), 'Paint assignment evidence recorded.')],
    crewExecution: 'working',
    updatedAt: at(20, 9, 20),
  }),
  notApplicable('jul28-unit-604', 'paint', 'E'),
  ...(['common', 'A', 'D'] as Jul28Section[]).map((section) => record('jul28-unit-604', 'clean', section, {
    authorization: 'released',
    assignmentEpisodes: [episode(`604-c-${section}`, 'initial', 'Harbor Clean', at(20, 12), 'Clean scope recorded separately from Paint.')],
    crewExecution: section === 'common' ? 'crew-reported-complete' : 'working',
    inspection: 'inspection-pending',
    updatedAt: at(20, 13),
  })),
  notApplicable('jul28-unit-604', 'clean', 'B'),
  record('jul28-unit-604', 'clean', 'C', {
    authorization: 'uncertain',
    access: 'occupied-or-restricted',
    restrictionLabel: 'Clean scope and access both require clarification.',
    updatedAt: at(20, 12),
  }),
  notApplicable('jul28-unit-604', 'clean', 'E'),
]);

const unit1305 = createUnit('jul28-unit-1305', '1305', 'Building B', 'Level 13', [
  ...(['common', 'A', 'B'] as Jul28Section[]).map((section) => record('jul28-unit-1305', 'paint', section, {
    authorization: 'released',
    assignmentEpisodes: [episode(`1305-p-${section}`, 'initial', 'Northline Paint', at(22, 7, 45), 'Paint assignment evidence recorded.')],
    crewExecution: 'crew-reported-complete',
    inspection: 'los-passed',
    propertyWalk: 'walk-pending',
    updatedAt: at(22, 10, 30),
  })),
  record('jul28-unit-1305', 'paint', 'C', {
    authorization: 'released',
    assignmentEpisodes: [episode('1305-p-c', 'initial', 'Northline Paint', at(22, 7, 45), 'Paint assignment evidence recorded.')],
    crewExecution: 'working',
    inspection: 'inspection-pending',
    propertyWalk: 'walk-not-ready',
    updatedAt: at(22, 10, 45),
  }),
  notApplicable('jul28-unit-1305', 'paint', 'D'),
  notApplicable('jul28-unit-1305', 'paint', 'E'),
  ...(['common', 'A'] as Jul28Section[]).map((section) => record('jul28-unit-1305', 'clean', section, {
    authorization: 'released',
    assignmentEpisodes: [episode(`1305-c-${section}`, 'initial', 'Harbor Clean', at(22, 11), 'Clean assignment evidence recorded independently.')],
    crewExecution: 'crew-reported-complete',
    inspection: 'inspection-pending',
    updatedAt: at(22, 12),
  })),
  record('jul28-unit-1305', 'clean', 'B', {
    authorization: 'released',
    assignmentEpisodes: [episode('1305-c-b', 'initial', 'Harbor Clean', at(22, 11), 'Clean assignment evidence recorded independently.')],
    crewExecution: 'assigned',
    inspection: 'inspection-pending',
    updatedAt: at(22, 12),
  }),
  record('jul28-unit-1305', 'clean', 'C', { authorization: 'not-released', updatedAt: at(22, 12) }),
  notApplicable('jul28-unit-1305', 'clean', 'D'),
  notApplicable('jul28-unit-1305', 'clean', 'E'),
]);

const syntheticUnits: readonly Jul28UnitRecord[] = [unit602, unit603, unit604, unit1305];

export const jul28SyntheticTurnBoardRepository: Jul28TurnBoardRepository = {
  source: 'synthetic-jul28-pattern-candidate',
  listUnits: () => syntheticUnits,
  getUnit: (unitId) => syntheticUnits.find((unit) => unit.id === unitId),
};

export const assertSyntheticFixtureCompleteness = () => syntheticUnits.every((unit) =>
  JUL28_TRADES.every((trade) => JUL28_SECTIONS.every((section) =>
    unit.records.some((candidate) => candidate.trade === trade && candidate.section === section),
  )),
);
