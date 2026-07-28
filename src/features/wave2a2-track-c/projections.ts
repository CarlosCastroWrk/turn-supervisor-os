import {
  TRACK_C_TRADES,
  type TrackCCrew,
  type TrackCCrewDetail,
  type TrackCCrewStats,
  type TrackCCrewSummary,
  type TrackCCompactUnitProjection,
  type TrackCConfirmedEvent,
  type TrackCInspectionState,
  type TrackCPropertyState,
  type TrackCState,
  type TrackCTrade,
  type TrackCTradeProgress,
  type TrackCUnit,
  type TrackCWalkCandidate,
  type TrackCWorkFact,
  type TrackCWorkProjection,
  type TrackCWorkTarget,
} from './model';
import { trackCWorkKey } from './model';

const confirmedTargetEvents = (
  state: TrackCState,
  target: TrackCWorkTarget,
): readonly TrackCConfirmedEvent[] => {
  const key = trackCWorkKey(target);
  return state.events.filter(
    (event) => event.confirmation === 'confirmed' && trackCWorkKey(event.target) === key,
  );
};

const factForTarget = (
  state: TrackCState,
  target: TrackCWorkTarget,
): TrackCWorkFact | undefined =>
  state.units
    .find((unit) => unit.id === target.unitId)
    ?.workFacts.find(
      (fact) => fact.trade === target.trade && fact.section === target.section,
    );

export const projectTrackCWork = (
  state: TrackCState,
  target: TrackCWorkTarget,
): TrackCWorkProjection | undefined => {
  const fact = factForTarget(state, target);
  if (!fact) return undefined;

  const events = confirmedTargetEvents(state, target);
  let activeCrewIds: string[] = [];
  let execution: TrackCWorkProjection['execution'] = 'unassigned';
  let inspection: TrackCInspectionState = 'not-ready';
  let property: TrackCPropertyState = 'not-ready';
  let callbackOpen = false;
  let callbackResolvedCount = 0;
  let personalPdsMirror = false;
  let paperReviewed = false;

  for (const event of events) {
    switch (event.eventType) {
      case 'assignment-confirmed':
        if (event.crewId && !activeCrewIds.includes(event.crewId)) {
          activeCrewIds = [...activeCrewIds, event.crewId];
        }
        execution = activeCrewIds.length > 0 ? 'assigned' : 'unassigned';
        break;
      case 'assignment-cleared':
        activeCrewIds = event.crewId
          ? activeCrewIds.filter((crewId) => crewId !== event.crewId)
          : [];
        execution = activeCrewIds.length > 0 ? 'assigned' : 'unassigned';
        break;
      case 'work-started':
        execution = 'working';
        break;
      case 'crew-reported-complete':
        execution = 'crew-reported-complete';
        inspection = 'needs-los-inspection';
        break;
      case 'los-passed':
        inspection = 'los-passed';
        property = 'pending-property-walk';
        callbackOpen = false;
        break;
      case 'callback-opened':
      case 'property-correction-requested':
        inspection = 'callback-open';
        property = 'not-ready';
        callbackOpen = true;
        personalPdsMirror = false;
        break;
      case 'callback-correction-reported':
        inspection = 'reinspection-pending';
        property = 'not-ready';
        callbackOpen = true;
        break;
      case 'callback-resolved':
        inspection = 'los-passed';
        property = 'pending-property-walk';
        callbackOpen = false;
        callbackResolvedCount += 1;
        break;
      case 'property-accepted':
        property = 'property-accepted';
        callbackOpen = false;
        break;
      case 'walk-not-walked':
      case 'walk-deferred':
        if (inspection === 'los-passed') property = 'pending-property-walk';
        break;
      case 'personal-pds-mirror-recorded':
        if (property === 'property-accepted') personalPdsMirror = true;
        break;
      case 'paper-reviewed':
        paperReviewed = true;
        break;
    }
  }

  if (activeCrewIds.length === 0) {
    execution = 'unassigned';
  } else if (execution === 'unassigned') {
    execution = 'assigned';
  }

  return {
    ...fact,
    activeCrewIds,
    responsibleCrewId: activeCrewIds.length === 1 ? activeCrewIds[0] : undefined,
    assignmentConflict:
      fact.release === 'assignment-conflict' ||
      fact.sourceConfidence === 'conflicting' ||
      activeCrewIds.length > 1,
    execution,
    inspection,
    property,
    callbackOpen,
    callbackResolvedCount,
    personalPdsMirror,
    paperReviewed,
    confirmedEventCount: events.length,
    latestConfirmedEvent: events[events.length - 1],
  };
};

export const projectTrackCUnitWork = (
  state: TrackCState,
  unitId: string,
): readonly TrackCWorkProjection[] => {
  const unit = state.units.find((candidate) => candidate.id === unitId);
  if (!unit) return [];
  return unit.workFacts
    .map((fact) => projectTrackCWork(state, fact))
    .filter((projection): projection is TrackCWorkProjection => Boolean(projection));
};

const crewNamesForIds = (
  crews: readonly TrackCCrew[],
  crewIds: readonly string[],
) =>
  crewIds
    .map((crewId) => crews.find((crew) => crew.id === crewId)?.name)
    .filter((name): name is string => Boolean(name));

const conciseProgressLabel = (
  projections: readonly TrackCWorkProjection[],
) => {
  const applicable = projections.length;
  const accepted = projections.filter((item) => item.property === 'property-accepted').length;
  const callbacks = projections.filter((item) => item.callbackOpen).length;
  const passed = projections.filter(
    (item) =>
      item.inspection === 'los-passed' ||
      item.property === 'property-accepted',
  ).length;
  const crewComplete = projections.filter(
    (item) => item.execution === 'crew-reported-complete',
  ).length;
  const working = projections.filter((item) => item.execution === 'working').length;
  const assigned = projections.filter((item) => item.activeCrewIds.length === 1).length;
  const released = projections.filter((item) => item.release === 'released').length;

  if (callbacks > 0) return `${callbacks} callback${callbacks === 1 ? '' : 's'}`;
  if (accepted > 0) return `${accepted}/${applicable} accepted`;
  if (passed > 0) return `${passed}/${applicable} Los passed`;
  if (crewComplete > 0) return `${crewComplete}/${applicable} crew complete`;
  if (working > 0) return `${working}/${applicable} working`;
  if (assigned > 0) return `${assigned}/${applicable} assigned`;
  if (released > 0) return `${released}/${applicable} released`;
  return 'No released work';
};

export const projectTrackCTradeProgress = (
  state: TrackCState,
  unitId: string,
  trade: TrackCTrade,
): TrackCTradeProgress => {
  const projections = projectTrackCUnitWork(state, unitId).filter(
    (item) => item.trade === trade,
  );
  const crewIds = [
    ...new Set(projections.flatMap((projection) => projection.activeCrewIds)),
  ];
  return {
    trade,
    applicable: projections.length,
    released: projections.filter((item) => item.release === 'released').length,
    assigned: projections.filter((item) => item.activeCrewIds.length === 1).length,
    working: projections.filter((item) => item.execution === 'working').length,
    crewReportedComplete: projections.filter(
      (item) => item.execution === 'crew-reported-complete',
    ).length,
    losPassed: projections.filter(
      (item) =>
        item.inspection === 'los-passed' ||
        item.property === 'property-accepted',
    ).length,
    callbacks: projections.filter((item) => item.callbackOpen).length,
    accepted: projections.filter((item) => item.property === 'property-accepted').length,
    paperMirrored: projections.filter((item) => item.personalPdsMirror).length,
    crewIds,
    conciseLabel: conciseProgressLabel(projections),
  };
};

const unitSignal = (
  projections: readonly TrackCWorkProjection[],
): Pick<
  TrackCCompactUnitProjection,
  'signal' | 'signalCount' | 'signalLabel'
> => {
  const needsMe = projections.filter(
    (item) =>
      item.inspection === 'needs-los-inspection' ||
      item.inspection === 'callback-open' ||
      item.inspection === 'reinspection-pending' ||
      item.assignmentConflict,
  );
  if (needsMe.length > 0) {
    return {
      signal: 'needs-me',
      signalCount: needsMe.length,
      signalLabel: `Needs Me · ${needsMe.length}`,
    };
  }

  const waiting = projections.filter(
    (item) =>
      item.release !== 'released' ||
      item.access !== 'clear' ||
      item.sourceConfidence !== 'confirmed' ||
      (item.release === 'released' && item.activeCrewIds.length === 0),
  );
  if (waiting.length > 0) {
    return {
      signal: 'waiting',
      signalCount: waiting.length,
      signalLabel: `Waiting · ${waiting.length}`,
    };
  }
  return { signal: 'none', signalCount: 0, signalLabel: 'On track' };
};

export const projectTrackCCompactUnit = (
  state: TrackCState,
  unit: TrackCUnit,
): TrackCCompactUnitProjection => {
  const paint = projectTrackCTradeProgress(state, unit.id, 'paint');
  const clean = projectTrackCTradeProgress(state, unit.id, 'clean');
  const projections = projectTrackCUnitWork(state, unit.id);
  const crewNames = crewNamesForIds(
    state.crews,
    [...paint.crewIds, ...clean.crewIds],
  );
  return {
    unitId: unit.id,
    unitNumber: unit.unitNumber,
    unitType: unit.unitType,
    locationLabel: unit.locationLabel,
    paint,
    clean,
    ...unitSignal(projections),
    searchText: [
      unit.unitNumber,
      unit.unitType,
      unit.locationLabel,
      ...crewNames,
      paint.conciseLabel,
      clean.conciseLabel,
    ]
      .join(' ')
      .toLocaleLowerCase(),
  };
};

export const searchTrackCCompactUnits = (
  state: TrackCState,
  query = '',
): readonly TrackCCompactUnitProjection[] => {
  const normalized = query.trim().toLocaleLowerCase();
  const projections = state.units.map((unit) =>
    projectTrackCCompactUnit(state, unit)
  );
  if (!normalized) return projections;
  return projections.filter((projection) =>
    projection.searchText.includes(normalized)
  );
};

const emptyCrewStats = (): TrackCCrewStats => ({
  currentAssignments: 0,
  waiting: 0,
  crewReportedComplete: 0,
  needsLosInspection: 0,
  losPassed: 0,
  openCallbacks: 0,
  resolvedCallbacks: 0,
  propertyAccepted: 0,
});

export const projectTrackCCrewDetail = (
  state: TrackCState,
  crewId: string,
): TrackCCrewDetail | undefined => {
  const crew = state.crews.find((candidate) => candidate.id === crewId);
  if (!crew) return undefined;

  const work = state.units.flatMap((unit) => projectTrackCUnitWork(state, unit.id));
  const crewWork = work.filter((projection) =>
    projection.activeCrewIds.includes(crewId)
  );
  const currentWork = crewWork.filter(
    (item) => item.property !== 'property-accepted',
  );
  const crewCompleteWork = crewWork.filter(
    (item) => item.execution === 'crew-reported-complete',
  );
  const losPassedWork = crewWork.filter(
    (item) =>
      item.inspection === 'los-passed' ||
      item.property === 'property-accepted',
  );
  const openCallbackWork = crewWork.filter((item) => item.callbackOpen);
  const propertyAcceptedWork = crewWork.filter(
    (item) => item.property === 'property-accepted',
  );

  const stats: TrackCCrewStats = {
    currentAssignments: currentWork.length,
    waiting: currentWork.filter(
      (item) =>
        item.release !== 'released' ||
        item.access !== 'clear' ||
        item.sourceConfidence !== 'confirmed',
    ).length,
    crewReportedComplete: crewCompleteWork.length,
    needsLosInspection: crewWork.filter(
      (item) => item.inspection === 'needs-los-inspection',
    ).length,
    losPassed: losPassedWork.length,
    openCallbacks: openCallbackWork.length,
    resolvedCallbacks: crewWork.reduce(
      (total, item) => total + item.callbackResolvedCount,
      0,
    ),
    propertyAccepted: propertyAcceptedWork.length,
  };

  const recentActivity = state.events
    .filter(
      (event) =>
        event.confirmation === 'confirmed' &&
        (event.crewId === crewId ||
          crewWork.some(
            (item) => trackCWorkKey(item) === trackCWorkKey(event.target),
          )),
    )
    .slice(-12)
    .reverse();

  return {
    crew,
    stats,
    currentWork,
    crewCompleteWork,
    losPassedWork,
    openCallbackWork,
    propertyAcceptedWork,
    recentActivity,
  };
};

export const projectTrackCCrewSummaries = (
  state: TrackCState,
): readonly TrackCCrewSummary[] =>
  state.crews.map((crew) => {
    const detail = projectTrackCCrewDetail(state, crew.id);
    return {
      crew,
      stats: detail?.stats ?? emptyCrewStats(),
    };
  });

export const projectTrackCWalkCandidates = (
  state: TrackCState,
): readonly TrackCWalkCandidate[] =>
  state.units.flatMap((unit) =>
    projectTrackCUnitWork(state, unit.id)
      .filter(
        (item) =>
          item.release === 'released' &&
          item.access === 'clear' &&
          item.sourceConfidence === 'confirmed' &&
          !item.assignmentConflict &&
          item.responsibleCrewId &&
          item.inspection === 'los-passed' &&
          item.property === 'pending-property-walk' &&
          !item.callbackOpen,
      )
      .map((item) => ({
        target: {
          unitId: item.unitId,
          trade: item.trade,
          section: item.section,
        },
        unitNumber: unit.unitNumber,
        unitType: unit.unitType,
        locationLabel: unit.locationLabel,
        crewId: item.responsibleCrewId as string,
      })),
  );

export const trackCCrewName = (
  state: TrackCState,
  crewId?: string,
) => state.crews.find((crew) => crew.id === crewId)?.name;

export const trackCUnitForTarget = (
  state: TrackCState,
  target: TrackCWorkTarget,
) => state.units.find((unit) => unit.id === target.unitId);

export const TRACK_C_PROJECTION_INVARIANTS = Object.freeze({
  authoritativePaperChanged: false,
  payrollCalculated: false,
  wholeUnitDoneState: false,
  statsSource: 'confirmed-events-only',
  trades: TRACK_C_TRADES,
});
