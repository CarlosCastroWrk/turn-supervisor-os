import type {
  Jul28AttentionKind,
  Jul28HistoryEvent,
  Jul28LayerProjection,
  Jul28Section,
  Jul28SectionTradeRecord,
  Jul28Trade,
  Jul28TurnBoardFilter,
  Jul28UnitCardProjection,
  Jul28UnitLayerProjection,
  Jul28UnitRecord,
} from './model';

const passedInspectionStates = new Set<Jul28SectionTradeRecord['inspection']>([
  'los-passed',
  'passed-after-callback',
]);

const unresolvedAuthorizationStates = new Set<Jul28SectionTradeRecord['authorization']>([
  'uncertain',
  'assignment-conflict',
]);

const activeAssignments = (record: Jul28SectionTradeRecord) =>
  record.assignmentEpisodes.filter((assignment) => assignment.active && assignment.kind !== 'cancellation');

const latestTimestamp = (records: Jul28SectionTradeRecord[]) =>
  [...records].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]?.updatedAt ?? '';

const aggregate = (
  total: number,
  recorded: number,
  attention: number,
  labels: { recorded: string; partial: string; pending: string; attention: string },
): Jul28LayerProjection => {
  if (total === 0) {
    return { label: 'Not applicable', detail: 'No applicable section scope.', tone: 'not-applicable' };
  }
  if (attention > 0) {
    return {
      label: labels.attention,
      detail: `${attention} of ${total} applicable section${total === 1 ? '' : 's'} need review.`,
      tone: 'attention',
    };
  }
  if (recorded === total) {
    return { label: labels.recorded, detail: `Recorded for ${recorded} of ${total} applicable sections.`, tone: 'recorded' };
  }
  if (recorded > 0) {
    return { label: labels.partial, detail: `Recorded for ${recorded} of ${total} applicable sections.`, tone: 'partial' };
  }
  return { label: labels.pending, detail: `No recorded fact for ${total} applicable section${total === 1 ? '' : 's'}.`, tone: 'pending' };
};

const projectLayers = (records: Jul28SectionTradeRecord[]): Jul28UnitLayerProjection => {
  const applicable = records.filter((record) => record.applicability === 'applicable');
  const assignmentAttention = applicable.filter((record) =>
    unresolvedAuthorizationStates.has(record.authorization) || activeAssignments(record).length > 1,
  ).length;
  const assignmentRecorded = applicable.filter((record) =>
    record.authorization === 'released' && activeAssignments(record).length === 1,
  ).length;
  const crewReported = applicable.filter((record) => record.crewExecution === 'crew-reported-complete').length;
  const inspectionAttention = applicable.filter((record) =>
    record.inspection === 'callback-required' || record.inspection === 'reinspection-pending' ||
    (record.crewExecution === 'crew-reported-complete' && record.access !== 'accessible' && !passedInspectionStates.has(record.inspection)),
  ).length;
  const inspectionRecorded = applicable.filter((record) => passedInspectionStates.has(record.inspection)).length;
  const propertyPending = applicable.filter((record) => record.propertyWalk === 'walk-pending').length;
  const paperRecorded = applicable.filter((record) => record.paperReview === 'paper-reviewed').length;

  return {
    assignmentEvidence: aggregate(applicable.length, assignmentRecorded, assignmentAttention, {
      recorded: 'Evidence recorded',
      partial: 'Partial evidence',
      pending: 'Evidence pending',
      attention: 'Evidence needs review',
    }),
    crewReported: aggregate(applicable.length, crewReported, 0, {
      recorded: 'Crew reported',
      partial: 'Partial crew reports',
      pending: 'Crew report pending',
      attention: 'Crew report needs review',
    }),
    losInspection: aggregate(applicable.length, inspectionRecorded, inspectionAttention, {
      recorded: 'My inspection recorded',
      partial: 'Partial inspections',
      pending: 'My inspection pending',
      attention: 'Inspection needs attention',
    }),
    propertyWalk: aggregate(applicable.length, 0, 0, {
      recorded: 'Property walk recorded',
      partial: 'Partial property walk',
      pending: propertyPending > 0 ? 'Property walk pending' : 'Property walk not ready',
      attention: 'Property walk needs attention',
    }),
    paperReview: aggregate(applicable.length, paperRecorded, 0, {
      recorded: 'Personally reviewed',
      partial: 'Partially reviewed',
      pending: 'Paper review needed',
      attention: 'Paper review needs attention',
    }),
  };
};

const attentionFor = (records: Jul28SectionTradeRecord[]): { kind: Jul28AttentionKind; label: string } => {
  const applicable = records.filter((record) => record.applicability === 'applicable');
  if (applicable.some((record) => record.authorization === 'assignment-conflict')) {
    return { kind: 'assignment-conflict', label: 'Assignment conflict' };
  }
  if (applicable.some((record) => activeAssignments(record).length > 1)) {
    return { kind: 'duplicate-assignment', label: 'Duplicate assignment claims' };
  }
  if (applicable.some((record) => record.inspection === 'callback-required' || record.inspection === 'reinspection-pending')) {
    return { kind: 'callback-required', label: 'Callback or reinspection' };
  }
  if (applicable.some((record) =>
    record.crewExecution === 'crew-reported-complete' &&
    record.access !== 'accessible' &&
    !passedInspectionStates.has(record.inspection),
  )) {
    return { kind: 'inspection-blocked', label: 'Inspection blocked' };
  }
  if (applicable.some((record) =>
    record.crewExecution === 'crew-reported-complete' &&
    record.access === 'accessible' &&
    record.inspection === 'inspection-pending',
  )) {
    return { kind: 'ready-for-my-walk', label: 'Ready for my walk' };
  }
  if (applicable.some((record) => record.assignmentEpisodes.some((assignment) => assignment.active && assignment.kind === 'added-scope'))) {
    return { kind: 'added-scope', label: 'Added scope recorded' };
  }
  if (applicable.some((record) => record.crewExecution === 'working' || record.crewExecution === 'assigned')) {
    return { kind: 'in-progress', label: 'Crew activity recorded' };
  }
  if (applicable.every((record) => passedInspectionStates.has(record.inspection)) && applicable.some((record) => record.paperReview === 'needs-paper-review')) {
    return { kind: 'paper-review', label: 'Needs paper review' };
  }
  return { kind: 'awaiting-crew', label: 'Awaiting crew report' };
};

export const recordsForTrade = (unit: Jul28UnitRecord, trade: Jul28Trade) =>
  unit.sectionOrder.map((section) => unit.records.find((record) => record.trade === trade && record.section === section))
    .filter((record): record is Jul28SectionTradeRecord => Boolean(record));

export const projectJul28UnitCard = (unit: Jul28UnitRecord, trade: Jul28Trade): Jul28UnitCardProjection => {
  const records = recordsForTrade(unit, trade);
  const applicable = records.filter((record) => record.applicability === 'applicable');
  const assignments = applicable.flatMap(activeAssignments);
  const attention = attentionFor(records);

  return {
    unitId: unit.id,
    unitNumber: unit.unitNumber,
    locationLabel: `${unit.buildingLabel} · ${unit.floorLabel}`,
    trade,
    applicableSections: applicable.map((record) => record.section),
    notApplicableSections: records.filter((record) => record.applicability === 'not-applicable').map((record) => record.section),
    restrictedSections: applicable.filter((record) => record.access !== 'accessible').map((record) => record.section),
    fullPaintSections: trade === 'paint' ? applicable.filter((record) => record.fullPaint).map((record) => record.section) : [],
    crewNames: [...new Set(assignments.map((assignment) => assignment.crewName))],
    duplicateAssignmentSections: applicable.filter((record) => activeAssignments(record).length > 1).map((record) => record.section),
    addedScopeSections: applicable.filter((record) =>
      record.assignmentEpisodes.some((assignment) => assignment.active && assignment.kind === 'added-scope'),
    ).map((record) => record.section),
    attentionKind: attention.kind,
    attentionLabel: attention.label,
    layers: projectLayers(records),
    updatedAt: latestTimestamp(records),
  };
};

const filterMatches = (projection: Jul28UnitCardProjection, filter: Jul28TurnBoardFilter) => {
  if (filter === 'all') return true;
  if (filter === 'needs-me') {
    return new Set<Jul28AttentionKind>([
      'assignment-conflict',
      'duplicate-assignment',
      'inspection-blocked',
      'callback-required',
      'ready-for-my-walk',
      'added-scope',
    ]).has(projection.attentionKind);
  }
  if (filter === 'crew-reported') {
    return projection.layers.crewReported.tone === 'recorded' || projection.layers.crewReported.tone === 'partial';
  }
  return projection.attentionKind === 'ready-for-my-walk';
};

export const projectJul28TurnBoard = (
  units: readonly Jul28UnitRecord[],
  trade: Jul28Trade,
  filter: Jul28TurnBoardFilter = 'all',
  query = '',
) => {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return units
    .map((unit) => projectJul28UnitCard(unit, trade))
    .filter((projection) => {
      if (!filterMatches(projection, filter)) return false;
      if (!normalizedQuery) return true;
      return [projection.unitNumber, projection.locationLabel, ...projection.crewNames]
        .join(' ')
        .toLocaleLowerCase()
        .includes(normalizedQuery);
    });
};

export interface Jul28TradeProgressProjection {
  applicableSectionCount: number;
  losPassedSectionCount: number;
  pendingSectionCount: number;
  allApplicableSectionsInspected: boolean;
  label: string;
}

export const projectJul28TradeProgress = (unit: Jul28UnitRecord, trade: Jul28Trade): Jul28TradeProgressProjection => {
  const applicable = recordsForTrade(unit, trade).filter((record) => record.applicability === 'applicable');
  const losPassedSectionCount = applicable.filter((record) => passedInspectionStates.has(record.inspection)).length;
  const pendingSectionCount = applicable.length - losPassedSectionCount;
  const allApplicableSectionsInspected = applicable.length > 0 && pendingSectionCount === 0;
  const attention = attentionFor(applicable);

  return {
    applicableSectionCount: applicable.length,
    losPassedSectionCount,
    pendingSectionCount,
    allApplicableSectionsInspected,
    label: allApplicableSectionsInspected
      ? 'My inspections recorded; property walk remains separate'
      : attention.label,
  };
};

export interface Jul28SectionFactProjection {
  key: 'assignment' | 'access' | 'crew' | 'inspection' | 'property-walk' | 'paper-review';
  heading: string;
  label: string;
  detail: string;
  tone: Jul28LayerProjection['tone'];
}

export const projectJul28SectionFacts = (record: Jul28SectionTradeRecord): Jul28SectionFactProjection[] => {
  if (record.applicability === 'not-applicable') {
    return [{
      key: 'assignment',
      heading: 'Section applicability',
      label: 'Not applicable',
      detail: 'This section position does not apply to this Unit/trade fixture. It is not complete or restricted.',
      tone: 'not-applicable',
    }];
  }

  const assignments = activeAssignments(record);
  const assignmentConflict = record.authorization === 'assignment-conflict' || assignments.length > 1;
  const assignmentLabel = assignmentConflict
    ? 'Needs clarification'
    : assignments.length === 1
      ? 'Evidence recorded'
      : 'No assignment evidence';
  const assignmentDetail = assignments.length > 0
    ? assignments.map((assignment) => `${assignment.crewName} · ${assignment.kind.replaceAll('-', ' ')}`).join(' | ')
    : 'No active synthetic assignment episode is recorded.';

  const accessLabel = record.access === 'accessible'
    ? 'Accessible'
    : record.access === 'occupied-or-restricted'
      ? 'Restricted — do not enter'
      : record.access.replaceAll('-', ' ');

  const crewLabel = record.crewExecution === 'crew-reported-complete'
    ? 'Crew reported complete'
    : record.crewExecution.replaceAll('-', ' ');

  const inspectionLabel: Record<Jul28SectionTradeRecord['inspection'], string> = {
    'inspection-pending': 'My inspection pending',
    'los-passed': 'My inspection recorded',
    'callback-required': 'Callback required',
    'reinspection-pending': 'Reinspection pending',
    'passed-after-callback': 'Passed after callback',
  };

  const propertyLabel: Record<Jul28SectionTradeRecord['propertyWalk'], string> = {
    'walk-not-recorded': 'Not recorded',
    'walk-not-ready': 'Not ready for property walk',
    'walk-pending': 'Property walk pending',
  };

  return [
    {
      key: 'assignment',
      heading: 'Assignment evidence',
      label: assignmentLabel,
      detail: assignmentDetail,
      tone: assignmentConflict ? 'attention' : assignments.length === 1 ? 'recorded' : 'pending',
    },
    {
      key: 'access',
      heading: 'Access / restriction',
      label: accessLabel,
      detail: record.restrictionLabel ?? 'No access restriction is recorded in this synthetic personal view.',
      tone: record.access === 'accessible' ? 'recorded' : 'attention',
    },
    {
      key: 'crew',
      heading: 'Crew reported',
      label: crewLabel,
      detail: 'Crew reporting is a separate fact. It is not Los inspection, property acceptance, paper reconciliation, or payroll.',
      tone: record.crewExecution === 'crew-reported-complete' ? 'recorded' : record.crewExecution === 'working' ? 'partial' : 'pending',
    },
    {
      key: 'inspection',
      heading: 'My inspection',
      label: inspectionLabel[record.inspection],
      detail: record.access !== 'accessible' && record.crewExecution === 'crew-reported-complete' && !passedInspectionStates.has(record.inspection)
        ? 'Crew completion is recorded, but access prevents the personal inspection from being recorded.'
        : 'Personal supervisor inspection remains independent from crew reporting and the property walk.',
      tone: passedInspectionStates.has(record.inspection)
        ? 'recorded'
        : record.inspection === 'callback-required' || record.inspection === 'reinspection-pending'
          ? 'attention'
          : 'pending',
    },
    {
      key: 'property-walk',
      heading: 'Property walk',
      label: propertyLabel[record.propertyWalk],
      detail: 'Wave 1 is read-only here. No PDS Approved or property-acceptance action is implemented.',
      tone: 'pending',
    },
    {
      key: 'paper-review',
      heading: 'Paper review',
      label: record.paperReview === 'paper-reviewed' ? 'Personally reviewed' : 'Needs paper review',
      detail: 'Paper remains authoritative. This personal reminder does not change an official board or payroll record.',
      tone: record.paperReview === 'paper-reviewed' ? 'recorded' : 'pending',
    },
  ];
};

export const projectJul28UnitHistory = (
  unit: Jul28UnitRecord,
  trade: Jul28Trade,
  section?: Jul28Section,
): Jul28HistoryEvent[] => recordsForTrade(unit, trade)
  .filter((record) => !section || record.section === section)
  .flatMap((record) => record.history)
  .filter((event, index, events) => events.findIndex((candidate) => candidate.id === event.id) === index)
  .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));
