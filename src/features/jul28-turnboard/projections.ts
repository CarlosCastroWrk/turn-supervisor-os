import {
  JUL28_TRADES,
  type Jul28AttentionFilter,
  type Jul28AttentionKind,
  type Jul28BlockerProjection,
  type Jul28FactKey,
  type Jul28FactProvenance,
  type Jul28HistoryEvent,
  type Jul28LayerProjection,
  type Jul28Section,
  type Jul28SectionTradeRecord,
  type Jul28SourceCoverageProjection,
  type Jul28Trade,
  type Jul28TradeSummaryProjection,
  type Jul28TurnBoardFilters,
  type Jul28UnitCardProjection,
  type Jul28UnitLayerProjection,
  type Jul28UnitRecord,
} from './model';

const passedInspectionStates = new Set<Jul28SectionTradeRecord['inspection']>([
  'los-passed',
  'passed-after-callback',
]);

const activeAssignments = (record: Jul28SectionTradeRecord) =>
  record.assignmentEpisodes.filter((assignment) => assignment.active && assignment.kind !== 'cancellation');

const latestTimestamp = (records: Jul28SectionTradeRecord[]) =>
  [...records].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]?.updatedAt ?? '';

const coverageKey = (trade: Jul28Trade, section: Jul28Section) => `${trade}:${section}`;

export const validateJul28SourceCoverage = (unit: Jul28UnitRecord): Jul28SourceCoverageProjection => {
  const missingKeys: string[] = [];
  const duplicateKeys: string[] = [];

  for (const trade of JUL28_TRADES) {
    for (const section of unit.sectionOrder) {
      const count = unit.records.filter((record) => record.trade === trade && record.section === section).length;
      if (count === 0) missingKeys.push(coverageKey(trade, section));
      if (count > 1) duplicateKeys.push(coverageKey(trade, section));
    }
  }

  const complete = missingKeys.length === 0 && duplicateKeys.length === 0;
  return {
    complete,
    expectedRecordCount: unit.sectionOrder.length * JUL28_TRADES.length,
    actualRecordCount: unit.records.filter((record) =>
      unit.sectionOrder.includes(record.section) && JUL28_TRADES.includes(record.trade),
    ).length,
    missingKeys,
    duplicateKeys,
    label: complete ? 'Source coverage complete' : 'Source coverage incomplete',
  };
};

export const recordsForTrade = (unit: Jul28UnitRecord, trade: Jul28Trade) =>
  unit.sectionOrder.map((section) => unit.records.find((record) => record.trade === trade && record.section === section))
    .filter((record): record is Jul28SectionTradeRecord => Boolean(record));

const sourceCoverageLayer = (): Jul28LayerProjection => ({
  label: 'Source coverage incomplete',
  detail: 'A Paint/Clean section record is missing or duplicated. No completion or readiness result is calculated.',
  tone: 'attention',
});

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

const projectLayers = (
  records: Jul28SectionTradeRecord[],
  coverage: Jul28SourceCoverageProjection,
): Jul28UnitLayerProjection => {
  if (!coverage.complete) {
    return {
      authorization: sourceCoverageLayer(),
      assignmentEvidence: sourceCoverageLayer(),
      crewReported: sourceCoverageLayer(),
      losInspection: sourceCoverageLayer(),
      propertyWalk: sourceCoverageLayer(),
      paperReview: sourceCoverageLayer(),
    };
  }

  const applicable = records.filter((record) => record.applicability === 'applicable');
  const authorizationAttention = applicable.filter((record) =>
    record.authorization === 'uncertain' || record.authorization === 'assignment-conflict',
  ).length;
  const authorizationRecorded = applicable.filter((record) => record.authorization === 'released').length;
  const assignmentAttention = applicable.filter((record) => activeAssignments(record).length > 1).length;
  const assignmentRecorded = applicable.filter((record) => activeAssignments(record).length === 1).length;
  const crewReported = applicable.filter((record) => record.crewExecution === 'crew-reported-complete').length;
  const inspectionAttention = applicable.filter((record) =>
    record.inspection === 'callback-required' ||
    record.inspection === 'reinspection-pending' ||
    (
      record.crewExecution === 'crew-reported-complete' &&
      record.access !== 'accessible' &&
      !passedInspectionStates.has(record.inspection)
    ),
  ).length;
  const inspectionRecorded = applicable.filter((record) => passedInspectionStates.has(record.inspection)).length;
  const propertyPending = applicable.filter((record) => record.propertyWalk === 'walk-pending').length;
  const paperRecorded = applicable.filter((record) => record.paperReview === 'paper-reviewed').length;

  return {
    authorization: aggregate(applicable.length, authorizationRecorded, authorizationAttention, {
      recorded: 'Released',
      partial: 'Partially released',
      pending: 'Not released',
      attention: 'Release needs clarification',
    }),
    assignmentEvidence: aggregate(applicable.length, assignmentRecorded, assignmentAttention, {
      recorded: 'Evidence recorded',
      partial: 'Partial evidence',
      pending: 'Evidence pending',
      attention: 'Evidence conflict',
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
    propertyWalk: {
      label: propertyPending > 0 ? 'Property walk pending' : 'Property walk not ready',
      detail: propertyPending > 0
        ? `${propertyPending} of ${applicable.length} applicable sections are recorded as pending a property walk.`
        : 'No positive property-walk result is represented in Wave 1.',
      tone: 'pending',
    },
    paperReview: aggregate(applicable.length, paperRecorded, 0, {
      recorded: 'Personally reviewed',
      partial: 'Partially reviewed',
      pending: 'Paper review needed',
      attention: 'Paper review needs attention',
    }),
  };
};

const readyForMyWalk = (record: Jul28SectionTradeRecord) =>
  record.applicability === 'applicable' &&
  record.authorization === 'released' &&
  activeAssignments(record).length === 1 &&
  record.crewExecution === 'crew-reported-complete' &&
  record.access === 'accessible' &&
  record.inspection === 'inspection-pending';

const attentionFor = (
  records: Jul28SectionTradeRecord[],
  coverage: Jul28SourceCoverageProjection,
): { kind: Jul28AttentionKind; label: string } => {
  if (!coverage.complete) {
    return { kind: 'source-coverage-incomplete', label: 'Source coverage incomplete' };
  }

  const applicable = records.filter((record) => record.applicability === 'applicable');
  if (applicable.some((record) => record.authorization === 'assignment-conflict')) {
    return { kind: 'assignment-conflict', label: 'Assignment conflict' };
  }
  if (applicable.some((record) => activeAssignments(record).length > 1)) {
    return { kind: 'duplicate-assignment', label: 'Duplicate assignment evidence' };
  }
  if (applicable.some((record) => record.inspection === 'callback-required' || record.inspection === 'reinspection-pending')) {
    return { kind: 'callback-required', label: 'Callback or reinspection' };
  }
  if (applicable.some((record) =>
    record.crewExecution === 'crew-reported-complete' &&
    record.access !== 'accessible' &&
    !passedInspectionStates.has(record.inspection),
  )) {
    return { kind: 'inspection-blocked', label: 'Inspection blocked by access' };
  }

  const readySections = applicable.filter(readyForMyWalk);
  if (readySections.length > 0) {
    return {
      kind: 'ready-for-my-walk',
      label: `${readySections.length} of ${applicable.length} sections ready for my walk`,
    };
  }
  if (applicable.some((record) => record.access !== 'accessible')) {
    return { kind: 'access-blocked', label: 'Access or restriction needs attention' };
  }
  if (applicable.some((record) =>
    record.assignmentEpisodes.some((assignment) => assignment.active && assignment.kind === 'added-scope'),
  )) {
    return { kind: 'added-scope', label: 'Added scope recorded' };
  }
  if (applicable.some((record) => record.crewExecution === 'working' || record.crewExecution === 'assigned')) {
    return { kind: 'in-progress', label: 'Crew activity recorded' };
  }
  if (applicable.some((record) => record.propertyWalk === 'walk-pending')) {
    return { kind: 'property-walk', label: 'Property walk remains pending' };
  }
  if (
    applicable.length > 0 &&
    applicable.every((record) => passedInspectionStates.has(record.inspection)) &&
    applicable.some((record) => record.paperReview === 'needs-paper-review')
  ) {
    return { kind: 'paper-review', label: 'Needs paper review' };
  }
  return { kind: 'awaiting-crew', label: 'Awaiting crew report' };
};

export const projectJul28TradeSummary = (
  unit: Jul28UnitRecord,
  trade: Jul28Trade,
): Jul28TradeSummaryProjection => {
  const coverage = validateJul28SourceCoverage(unit);
  const records = recordsForTrade(unit, trade);
  const attention = attentionFor(records, coverage);

  if (!coverage.complete) {
    return {
      trade,
      sourceCoverageComplete: false,
      applicableSectionCount: null,
      readyForMyWalkSections: [],
      readyForMyWalkCount: null,
      losPassedSectionCount: null,
      pendingInspectionCount: null,
      attentionKind: attention.kind,
      attentionLabel: attention.label,
      readinessLabel: 'Source coverage incomplete — readiness not calculated',
    };
  }

  const applicable = records.filter((record) => record.applicability === 'applicable');
  const readySections = applicable.filter(readyForMyWalk).map((record) => record.section);
  const passedCount = applicable.filter((record) => passedInspectionStates.has(record.inspection)).length;
  return {
    trade,
    sourceCoverageComplete: true,
    applicableSectionCount: applicable.length,
    readyForMyWalkSections: readySections,
    readyForMyWalkCount: readySections.length,
    losPassedSectionCount: passedCount,
    pendingInspectionCount: applicable.length - passedCount,
    attentionKind: attention.kind,
    attentionLabel: attention.label,
    readinessLabel: `${readySections.length} of ${applicable.length} sections ready for my walk`,
  };
};

export const projectJul28UnitCard = (unit: Jul28UnitRecord, trade: Jul28Trade): Jul28UnitCardProjection => {
  const coverage = validateJul28SourceCoverage(unit);
  const records = recordsForTrade(unit, trade);
  const applicable = records.filter((record) => record.applicability === 'applicable');
  const assignments = applicable.flatMap(activeAssignments);
  const summary = projectJul28TradeSummary(unit, trade);

  return {
    unitId: unit.id,
    unitNumber: unit.unitNumber,
    unitTypeLabel: unit.unitTypeLabel,
    locationLabel: `${unit.buildingLabel} · ${unit.floorLabel}`,
    trade,
    sourceCoverage: coverage,
    tradeSummaries: {
      paint: projectJul28TradeSummary(unit, 'paint'),
      clean: projectJul28TradeSummary(unit, 'clean'),
    },
    applicableSections: applicable.map((record) => record.section),
    notApplicableSections: records.filter((record) => record.applicability === 'not-applicable').map((record) => record.section),
    restrictedSections: applicable.filter((record) => record.access === 'occupied-or-restricted').map((record) => record.section),
    accessBlockedSections: applicable.filter((record) => record.access === 'access-blocked').map((record) => record.section),
    maintenanceBlockedSections: applicable.filter((record) => record.access === 'maintenance-blocked').map((record) => record.section),
    fullPaintSections: trade === 'paint' ? applicable.filter((record) => record.fullPaint).map((record) => record.section) : [],
    crewNames: [...new Set(assignments.map((assignment) => assignment.crewName))],
    duplicateAssignmentSections: applicable.filter((record) => activeAssignments(record).length > 1).map((record) => record.section),
    addedScopeSections: applicable.filter((record) =>
      record.assignmentEpisodes.some((assignment) => assignment.active && assignment.kind === 'added-scope'),
    ).map((record) => record.section),
    readyForMyWalkSections: summary.readyForMyWalkSections,
    readyForMyWalkCount: summary.readyForMyWalkCount,
    attentionKind: summary.attentionKind,
    attentionLabel: summary.attentionLabel,
    layers: projectLayers(records, coverage),
    updatedAt: latestTimestamp(records),
  };
};

const attentionMatches = (
  projection: Jul28UnitCardProjection,
  records: Jul28SectionTradeRecord[],
  filter: Jul28AttentionFilter,
) => {
  if (filter === 'all') return true;
  if (!projection.sourceCoverage.complete) return false;
  if (filter === 'needs-inspection') {
    return records.some((record) =>
      record.applicability === 'applicable' &&
      record.crewExecution === 'crew-reported-complete' &&
      !passedInspectionStates.has(record.inspection),
    );
  }
  if (filter === 'callback') {
    return records.some((record) => record.inspection === 'callback-required' || record.inspection === 'reinspection-pending');
  }
  if (filter === 'property-walk') {
    return records.some((record) => record.applicability === 'applicable' && record.propertyWalk === 'walk-pending');
  }
  if (filter === 'access-blocked') {
    return records.some((record) => record.applicability === 'applicable' && record.access !== 'accessible');
  }
  return records.some((record) =>
    record.applicability === 'applicable' &&
    (record.authorization === 'assignment-conflict' || activeAssignments(record).length > 1),
  );
};

export const projectJul28TurnBoard = (
  units: readonly Jul28UnitRecord[],
  trade: Jul28Trade,
  filters: Jul28TurnBoardFilters = { attention: 'all', buildingFloor: 'all', crew: 'all' },
  query = '',
) => {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
  return units
    .map((unit) => ({ unit, projection: projectJul28UnitCard(unit, trade) }))
    .filter(({ unit, projection }) => {
      const records = recordsForTrade(unit, trade);
      if (!attentionMatches(projection, records, filters.attention)) return false;
      if (filters.buildingFloor !== 'all' && projection.locationLabel !== filters.buildingFloor) return false;
      if (filters.crew !== 'all' && !projection.crewNames.includes(filters.crew)) return false;
      if (queryTokens.length === 0) return true;
      const searchableText = [
        projection.unitNumber,
        projection.unitTypeLabel,
        projection.locationLabel,
        ...projection.crewNames,
      ].join(' ').toLocaleLowerCase();
      return queryTokens.every((token) => searchableText.includes(token));
    })
    .map(({ projection }) => projection);
};

export const projectJul28FilterOptions = (units: readonly Jul28UnitRecord[], trade: Jul28Trade) => ({
  buildingFloors: [...new Set(units.map((unit) => `${unit.buildingLabel} · ${unit.floorLabel}`))].sort(),
  crews: [...new Set(units.flatMap((unit) =>
    recordsForTrade(unit, trade).flatMap((record) => activeAssignments(record).map((assignment) => assignment.crewName)),
  ))].sort(),
});

export interface Jul28TradeProgressProjection {
  sourceCoverageComplete: boolean;
  applicableSectionCount: number | null;
  readyForMyWalkSections: Jul28Section[];
  readyForMyWalkCount: number | null;
  losPassedSectionCount: number | null;
  pendingSectionCount: number | null;
  allApplicableSectionsInspected: boolean;
  label: string;
}

export const projectJul28TradeProgress = (unit: Jul28UnitRecord, trade: Jul28Trade): Jul28TradeProgressProjection => {
  const summary = projectJul28TradeSummary(unit, trade);
  if (!summary.sourceCoverageComplete) {
    return {
      sourceCoverageComplete: false,
      applicableSectionCount: null,
      readyForMyWalkSections: [],
      readyForMyWalkCount: null,
      losPassedSectionCount: null,
      pendingSectionCount: null,
      allApplicableSectionsInspected: false,
      label: 'Source coverage incomplete — completion and readiness are not calculated',
    };
  }

  const applicableSectionCount = summary.applicableSectionCount ?? 0;
  const pendingSectionCount = summary.pendingInspectionCount ?? 0;
  return {
    sourceCoverageComplete: true,
    applicableSectionCount,
    readyForMyWalkSections: summary.readyForMyWalkSections,
    readyForMyWalkCount: summary.readyForMyWalkCount,
    losPassedSectionCount: summary.losPassedSectionCount,
    pendingSectionCount,
    allApplicableSectionsInspected: applicableSectionCount > 0 && pendingSectionCount === 0,
    label: summary.losPassedSectionCount === applicableSectionCount && applicableSectionCount > 0
      ? 'My inspections are recorded for all applicable sections; property walk and paper review remain separate'
      : summary.readinessLabel,
  };
};

export interface Jul28SectionFactProjection {
  key: Jul28FactKey;
  heading: string;
  label: string;
  detail: string;
  tone: Jul28LayerProjection['tone'];
  provenance: Jul28FactProvenance;
}

const authorizationLabel: Record<Jul28SectionTradeRecord['authorization'], string> = {
  'not-released': 'Not released',
  released: 'Released',
  uncertain: 'Uncertain',
  'assignment-conflict': 'Assignment conflict',
};

const accessCopy: Record<Jul28SectionTradeRecord['access'], { label: string; detail: string; tone: Jul28LayerProjection['tone'] }> = {
  accessible: {
    label: 'Accessible',
    detail: 'No access restriction is recorded in this synthetic personal view.',
    tone: 'recorded',
  },
  'occupied-or-restricted': {
    label: 'Occupied / restricted — do not enter',
    detail: 'Entry is restricted until the accountable property contact clarifies access.',
    tone: 'attention',
  },
  'access-blocked': {
    label: 'Access blocked',
    detail: 'Entry cannot proceed until access is restored or clarified.',
    tone: 'attention',
  },
  'maintenance-blocked': {
    label: 'Maintenance blocked',
    detail: 'Maintenance work is blocking this section; coordinate resolution before inspection.',
    tone: 'attention',
  },
};

export const projectJul28SectionFacts = (record: Jul28SectionTradeRecord): Jul28SectionFactProjection[] => {
  if (record.applicability === 'not-applicable') {
    return [{
      key: 'applicability',
      heading: 'Section applicability',
      label: 'Not applicable',
      detail: 'This section position does not apply to this Unit/trade fixture. It is not complete or restricted.',
      tone: 'not-applicable',
      provenance: record.provenance.applicability,
    }];
  }

  const assignments = activeAssignments(record);
  const assignmentConflict = assignments.length > 1;
  const assignmentLabel = assignmentConflict
    ? 'Conflicting assignment evidence'
    : assignments.length === 1
      ? 'Assignment evidence recorded'
      : 'No assignment evidence';
  const assignmentDetail = assignments.length > 0
    ? assignments.map((assignment) => `${assignment.crewName} · ${assignment.kind.replaceAll('-', ' ')}`).join(' | ')
    : 'No active synthetic assignment episode is recorded.';

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

  const access = accessCopy[record.access];
  return [
    {
      key: 'authorization',
      heading: 'Authorization / release',
      label: authorizationLabel[record.authorization],
      detail: 'Release authority is a separate fact from assignment evidence and crew activity.',
      tone: record.authorization === 'released'
        ? 'recorded'
        : record.authorization === 'not-released'
          ? 'pending'
          : 'attention',
      provenance: record.provenance.authorization,
    },
    {
      key: 'assignment-evidence',
      heading: 'Assignment evidence',
      label: assignmentLabel,
      detail: assignmentDetail,
      tone: assignmentConflict ? 'attention' : assignments.length === 1 ? 'recorded' : 'pending',
      provenance: record.provenance['assignment-evidence'],
    },
    {
      key: 'access',
      heading: 'Access / restriction',
      label: access.label,
      detail: record.restrictionLabel ?? access.detail,
      tone: access.tone,
      provenance: record.provenance.access,
    },
    {
      key: 'crew-report',
      heading: 'Crew reported',
      label: crewLabel,
      detail: 'Crew reporting is separate from Los inspection, property walk, paper review, and payroll.',
      tone: record.crewExecution === 'crew-reported-complete'
        ? 'recorded'
        : record.crewExecution === 'working'
          ? 'partial'
          : 'pending',
      provenance: record.provenance['crew-report'],
    },
    {
      key: 'los-inspection',
      heading: 'My inspection',
      label: inspectionLabel[record.inspection],
      detail: record.access !== 'accessible' &&
        record.crewExecution === 'crew-reported-complete' &&
        !passedInspectionStates.has(record.inspection)
        ? 'Crew completion is recorded, but access prevents the personal inspection from being recorded.'
        : 'Personal supervisor inspection remains independent from crew reporting and the property walk.',
      tone: passedInspectionStates.has(record.inspection)
        ? 'recorded'
        : record.inspection === 'callback-required' || record.inspection === 'reinspection-pending'
          ? 'attention'
          : 'pending',
      provenance: record.provenance['los-inspection'],
    },
    {
      key: 'property-walk',
      heading: 'Property walk',
      label: propertyLabel[record.propertyWalk],
      detail: 'Wave 1 is read-only here. No positive property result or internal approval can be recorded.',
      tone: 'pending',
      provenance: record.provenance['property-walk'],
    },
    {
      key: 'paper-review',
      heading: 'Paper review',
      label: record.paperReview === 'paper-reviewed' ? 'Personally reviewed' : 'Needs paper review',
      detail: 'Paper remains authoritative. This personal reminder does not change an official board or payroll record.',
      tone: record.paperReview === 'paper-reviewed' ? 'recorded' : 'pending',
      provenance: record.provenance['paper-review'],
    },
  ];
};

export const projectJul28Blocker = (
  record: Jul28SectionTradeRecord,
  coverage?: Jul28SourceCoverageProjection,
): Jul28BlockerProjection | null => {
  if (coverage && !coverage.complete) {
    return {
      kind: 'source-coverage',
      label: 'Source coverage incomplete',
      owner: 'Los',
      nextAction: 'Compare the synthetic source adapter against the complete Unit section list.',
      resolution: 'Exactly one Paint and one Clean record exists for every expected section.',
      tone: 'attention',
    };
  }
  if (record.applicability === 'not-applicable') return null;
  if (record.authorization === 'assignment-conflict' || record.authorization === 'uncertain') {
    return {
      kind: 'authorization',
      label: record.authorization === 'assignment-conflict' ? 'Assignment conflict' : 'Release is uncertain',
      owner: 'Tony / accountable assignment source',
      nextAction: 'Clarify the current release fact without choosing a crew claim automatically.',
      resolution: 'One current authorization fact is recorded with accountable source evidence.',
      tone: 'attention',
    };
  }
  if (record.authorization === 'not-released') {
    return {
      kind: 'authorization',
      label: 'Not released',
      owner: 'Accountable assignment source',
      nextAction: 'Confirm whether this section has been released before treating it as active scope.',
      resolution: 'A released or explicitly not-released fact is recorded from the accountable source.',
      tone: 'pending',
    };
  }
  if (activeAssignments(record).length > 1) {
    return {
      kind: 'assignment',
      label: 'Conflicting assignment evidence',
      owner: 'Tony / accountable assignment source',
      nextAction: 'Clarify which assignment episode is current.',
      resolution: 'Exactly one active assignment episode remains; prior episodes stay in history.',
      tone: 'attention',
    };
  }
  if (record.access === 'occupied-or-restricted') {
    return {
      kind: 'occupied-or-restricted',
      label: 'Occupied / restricted',
      owner: 'Property contact / Tony',
      nextAction: 'Confirm whether entry is allowed and record the permitted work window.',
      resolution: 'Access is explicitly clarified; until then, do not enter.',
      tone: 'attention',
    };
  }
  if (record.access === 'access-blocked') {
    return {
      kind: 'access-blocked',
      label: 'Access blocked',
      owner: 'Property access contact',
      nextAction: 'Restore or clarify key, fob, door, or escort access.',
      resolution: 'The section is accessible or a clear restriction remains recorded.',
      tone: 'attention',
    };
  }
  if (record.access === 'maintenance-blocked') {
    return {
      kind: 'maintenance-blocked',
      label: 'Maintenance blocked',
      owner: 'Maintenance / property contact',
      nextAction: 'Coordinate completion of the maintenance dependency.',
      resolution: 'Maintenance clears the dependency and the access fact is updated.',
      tone: 'attention',
    };
  }
  if (record.inspection === 'callback-required') {
    return {
      kind: 'callback',
      label: 'Callback required',
      owner: 'Original crew',
      nextAction: 'Send the recorded miss back to the original crew for correction.',
      resolution: 'Correction is reported and this section moves to reinspection pending.',
      tone: 'attention',
    };
  }
  if (record.inspection === 'reinspection-pending') {
    return {
      kind: 'reinspection',
      label: 'Reinspection pending',
      owner: 'Los',
      nextAction: 'Reinspect the corrected section.',
      resolution: 'Record the personal reinspection result; property walk remains separate.',
      tone: 'pending',
    };
  }
  if (record.crewExecution !== 'crew-reported-complete') {
    return {
      kind: 'crew-report',
      label: 'Crew report pending',
      owner: activeAssignments(record)[0]?.crewName ?? 'Unassigned',
      nextAction: 'Wait for or clarify the crew report without changing inspection state.',
      resolution: 'A crew report is recorded as its own fact.',
      tone: 'pending',
    };
  }
  if (record.paperReview === 'needs-paper-review' && passedInspectionStates.has(record.inspection)) {
    return {
      kind: 'paper-review',
      label: 'Needs paper review',
      owner: 'Los',
      nextAction: 'Reconcile this personal record against the authoritative paper TurnBoard.',
      resolution: 'Personal paper-review reminder is cleared; no official mark is changed by the app.',
      tone: 'pending',
    };
  }
  return null;
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
