import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import { parseJsonBackup } from '../src/lib/backups.ts';
import { buildJsonBackup } from '../src/lib/exporters.ts';
import type { AppData } from '../src/types.ts';

const cloneSeed = (): AppData => JSON.parse(JSON.stringify(seedData)) as AppData;
const stamp = '2026-07-28T13:00:00.000Z';
const minutesAfterStamp = (minutes: number) =>
  new Date(Date.parse(stamp) + minutes * 60_000).toISOString();

const withLocalFieldState = (): AppData => {
  const data = cloneSeed();
  const projectId = data.activeProjectId;
  const unitId = data.units[0].id;

  data.dailyReleaseBatches = [
    {
      id: 'release_2026-07-28',
      projectId,
      date: '2026-07-28',
      propertyContact: 'Property contact',
      sourceType: 'paste',
      sourceLabel: 'Morning release list',
      localSourceReference: 'local-source-1',
      status: 'confirmed',
      items: [
        {
          id: 'release_item_101_common_paint',
          unitId,
          trade: 'paint',
          section: 'common',
          restriction: 'Key required',
          sourceExcerpt: '101 common paint',
        },
      ],
      uncertainties: [],
      confirmedBy: 'Los',
      confirmedAt: stamp,
      createdAt: stamp,
      updatedAt: stamp,
    },
  ];
  data.daySessions = [
    {
      id: 'day_session_2026-07-28',
      projectId,
      date: '2026-07-28',
      startedAt: stamp,
      startedBy: 'Los',
      propertyContact: 'Property contact',
      keyStatus: 'partial-issue',
      releaseBatchIds: ['release_2026-07-28'],
      activePaintCrewIds: ['crew_painter'],
      activeCleanCrewIds: ['crew_cleaner'],
      morningNote: 'Paper remains authoritative.',
      status: 'active',
      propertyCheckInNote: 'Confirmed in person.',
      createdAt: stamp,
      updatedAt: stamp,
    },
  ];
  data.todayTasks = [
    {
      id: 'today_task_101_common_paint',
      projectId,
      daySessionId: 'day_session_2026-07-28',
      date: '2026-07-28',
      unitId,
      trade: 'paint',
      section: 'common',
      kind: 'inspection',
      title: 'Inspect Unit 101 common paint',
      slot: 'current',
      status: 'in-progress',
      createdAt: stamp,
      updatedAt: stamp,
    },
  ];
  data.fieldEvents = [
    {
      id: 'field_event_101_common_paint',
      projectId,
      daySessionId: 'day_session_2026-07-28',
      unitId,
      section: 'common',
      trade: 'paint',
      actorType: 'supervisor',
      actorId: 'Los',
      recordedAt: stamp,
      recordedBy: 'Los',
      sourceType: 'direct-note',
      eventType: 'los-passed',
      summary: 'Los recorded a personal inspection pass.',
      boundary: 'personal-record',
    },
  ];
  data.walkSessions = [
    {
      id: 'walk_session_2026-07-28',
      projectId,
      daySessionId: 'day_session_2026-07-28',
      propertyContact: 'Property contact',
      startedAt: stamp,
      startedBy: 'Los',
      selectedItemIds: ['release_item_101_common_paint'],
      outcomes: [{ selectedItemId: 'release_item_101_common_paint', outcome: 'accepted' }],
      status: 'closed',
      endedAt: stamp,
      note: 'Personal property-walk outcome only.',
      createdAt: stamp,
      updatedAt: stamp,
    },
  ];

  return data;
};

test('current backup envelopes round-trip through restore validation', () => {
  const data = cloneSeed();
  const restored = parseJsonBackup(buildJsonBackup(data));

  assert.equal(restored.activeProjectId, data.activeProjectId);
  assert.equal(restored.projects.length, data.projects.length);
  assert.equal(restored.projects[0]?.id, data.projects[0]?.id);
  assert.equal(restored.projects[0]?.name, data.projects[0]?.name);
  assert.deepEqual(restored.units, data.units);
  assert.deepEqual(restored.daySessions, []);
  assert.deepEqual(restored.dailyReleaseBatches, []);
  assert.deepEqual(restored.todayTasks, []);
  assert.deepEqual(restored.fieldEvents, []);
  assert.deepEqual(restored.walkSessions, []);
});

test('legacy bare AppData backups remain restorable and receive missing collection defaults', () => {
  const data = cloneSeed() as AppData & {
    aiUsageEvents?: AppData['aiUsageEvents'];
    dailyReleaseBatches?: AppData['dailyReleaseBatches'];
    daySessions?: AppData['daySessions'];
    fieldEvents?: AppData['fieldEvents'];
    reportDrafts?: AppData['reportDrafts'];
    todayTasks?: AppData['todayTasks'];
    walkSessions?: AppData['walkSessions'];
  };
  delete data.reportDrafts;
  delete data.aiUsageEvents;
  delete data.daySessions;
  delete data.dailyReleaseBatches;
  delete data.todayTasks;
  delete data.fieldEvents;
  delete data.walkSessions;
  delete (data.projects[0] as AppData['projects'][number] & { aiBudgetUsd?: number }).aiBudgetUsd;

  const restored = parseJsonBackup(JSON.stringify(data));

  assert.equal(restored.activeProjectId, seedData.activeProjectId);
  assert.deepEqual(restored.reportDrafts, []);
  assert.deepEqual(restored.aiUsageEvents, []);
  assert.deepEqual(restored.daySessions, []);
  assert.deepEqual(restored.dailyReleaseBatches, []);
  assert.deepEqual(restored.todayTasks, []);
  assert.deepEqual(restored.fieldEvents, []);
  assert.deepEqual(restored.walkSessions, []);
  assert.equal(restored.projects[0].aiBudgetUsd, 10);
});

test('local-only Wave 2A.2 records round-trip through strict backup validation', () => {
  const data = withLocalFieldState();
  const restored = parseJsonBackup(buildJsonBackup(data));

  assert.deepEqual(restored.daySessions, data.daySessions);
  assert.deepEqual(restored.dailyReleaseBatches, data.dailyReleaseBatches);
  assert.deepEqual(restored.todayTasks, data.todayTasks);
  assert.deepEqual(restored.fieldEvents, data.fieldEvents);
  assert.deepEqual(restored.walkSessions, data.walkSessions);
});

test('malformed or contradictory Wave 2A.2 local records fail closed', () => {
  const invalidTrade = withLocalFieldState();
  invalidTrade.dailyReleaseBatches[0].items[0].trade = 'Paint' as never;

  const invalidProjectScope = withLocalFieldState();
  invalidProjectScope.fieldEvents[0].projectId = 'project_not_in_backup';

  const duplicateOpenSession = withLocalFieldState();
  duplicateOpenSession.daySessions.push({
    ...duplicateOpenSession.daySessions[0],
    id: 'day_session_duplicate_open',
    status: 'reopened',
  });

  const unselectedWalkOutcome = withLocalFieldState();
  unselectedWalkOutcome.walkSessions[0].outcomes[0].selectedItemId = 'release_item_not_selected';

  assert.throws(
    () => parseJsonBackup(JSON.stringify(invalidTrade)),
    /dailyReleaseBatches\.0\.items\.0\.trade/,
  );
  assert.throws(
    () => parseJsonBackup(JSON.stringify(invalidProjectScope)),
    /fieldEvents\.0\.projectId/,
  );
  assert.throws(
    () => parseJsonBackup(JSON.stringify(duplicateOpenSession)),
    /daySessions\.1\.status.*Only one active, ending, or reopened Day Session/,
  );
  assert.throws(
    () => parseJsonBackup(JSON.stringify(unselectedWalkOutcome)),
    /walkSessions\.0\.outcomes\.0\.selectedItemId/,
  );
});

test('Wave 2A.2 timestamps and lifecycle combinations fail closed', () => {
  const invalidDate = withLocalFieldState();
  invalidDate.daySessions[0].date = '07/28/2026';

  const activeSessionWithEnd = withLocalFieldState();
  activeSessionWithEnd.daySessions[0].endedAt = minutesAfterStamp(1);

  const dayEndBeforeStart = withLocalFieldState();
  dayEndBeforeStart.daySessions[0].status = 'closed';
  dayEndBeforeStart.daySessions[0].endedAt = minutesAfterStamp(-1);
  dayEndBeforeStart.todayTasks[0].status = 'completed';

  const eventOccurredAfterRecording = withLocalFieldState();
  eventOccurredAfterRecording.fieldEvents[0].occurredAt = minutesAfterStamp(1);

  const walkBeforeDay = withLocalFieldState();
  walkBeforeDay.walkSessions[0].createdAt = minutesAfterStamp(-1);
  walkBeforeDay.walkSessions[0].startedAt = minutesAfterStamp(-1);

  const activeTaskAfterDayClose = withLocalFieldState();
  activeTaskAfterDayClose.daySessions[0].status = 'closed';
  activeTaskAfterDayClose.daySessions[0].endedAt = minutesAfterStamp(2);
  activeTaskAfterDayClose.daySessions[0].updatedAt = minutesAfterStamp(2);

  assert.throws(
    () => parseJsonBackup(JSON.stringify(invalidDate)),
    /daySessions\.0\.date/,
  );
  assert.throws(
    () => parseJsonBackup(JSON.stringify(activeSessionWithEnd)),
    /daySessions\.0\.endedAt.*Only a closed Day Session may have endedAt/,
  );
  assert.throws(
    () => parseJsonBackup(JSON.stringify(dayEndBeforeStart)),
    /daySessions\.0\.endedAt.*cannot be earlier than startedAt/,
  );
  assert.throws(
    () => parseJsonBackup(JSON.stringify(eventOccurredAfterRecording)),
    /fieldEvents\.0\.occurredAt.*cannot be later than recordedAt/,
  );
  assert.throws(
    () => parseJsonBackup(JSON.stringify(walkBeforeDay)),
    /walkSessions\.0\.startedAt.*cannot start before its Day Session/,
  );
  assert.throws(
    () => parseJsonBackup(JSON.stringify(activeTaskAfterDayClose)),
    /todayTasks\.0\.status.*cannot retain planned or in-progress Today Tasks/,
  );
});

test('Wave 2A.2 release and Day Session references fail closed across project boundaries', () => {
  const missingReleaseUnit = withLocalFieldState();
  missingReleaseUnit.dailyReleaseBatches[0].items[0].unitId = 'unit_not_in_backup';

  const missingSessionRelease = withLocalFieldState();
  missingSessionRelease.daySessions[0].releaseBatchIds = ['release_not_in_backup'];

  const otherProjectRelease = withLocalFieldState();
  otherProjectRelease.projects.push({
    ...otherProjectRelease.projects[0],
    id: 'project_other',
    name: 'Other project',
    mode: 'real',
  });
  otherProjectRelease.dailyReleaseBatches[0].projectId = 'project_other';

  assert.throws(
    () => parseJsonBackup(JSON.stringify(missingReleaseUnit)),
    /dailyReleaseBatches\.0\.items\.0\.unitId.*Release item Unit must exist in the same project/,
  );
  assert.throws(
    () => parseJsonBackup(JSON.stringify(missingSessionRelease)),
    /daySessions\.0\.releaseBatchIds\.0.*Day Session release batch must exist in the same project/,
  );
  assert.throws(
    () => parseJsonBackup(JSON.stringify(otherProjectRelease)),
    /daySessions\.0\.releaseBatchIds\.0.*Day Session release batch must exist in the same project/,
  );
});

test('Wave 2A.2 Task, Event, and Walk references must stay in their project', () => {
  const missingTaskSession = withLocalFieldState();
  missingTaskSession.todayTasks[0].daySessionId = 'day_session_not_in_backup';

  const missingTaskUnit = withLocalFieldState();
  missingTaskUnit.todayTasks[0].unitId = 'unit_not_in_backup';

  const missingEventSession = withLocalFieldState();
  missingEventSession.fieldEvents[0].daySessionId = 'day_session_not_in_backup';

  const missingEventUnit = withLocalFieldState();
  missingEventUnit.fieldEvents[0].unitId = 'unit_not_in_backup';

  const missingWalkSession = withLocalFieldState();
  missingWalkSession.walkSessions[0].daySessionId = 'day_session_not_in_backup';

  assert.throws(
    () => parseJsonBackup(JSON.stringify(missingTaskSession)),
    /todayTasks\.0\.daySessionId.*Today Task Day Session must exist in the same project/,
  );
  assert.throws(
    () => parseJsonBackup(JSON.stringify(missingTaskUnit)),
    /todayTasks\.0\.unitId.*Today Task Unit must exist in the same project/,
  );
  assert.throws(
    () => parseJsonBackup(JSON.stringify(missingEventSession)),
    /fieldEvents\.0\.daySessionId.*Field Event Day Session must exist in the same project/,
  );
  assert.throws(
    () => parseJsonBackup(JSON.stringify(missingEventUnit)),
    /fieldEvents\.0\.unitId.*Field Event Unit must exist in the same project/,
  );
  assert.throws(
    () => parseJsonBackup(JSON.stringify(missingWalkSession)),
    /walkSessions\.0\.daySessionId.*Walk Session Day Session must exist in the same project/,
  );
});

test('confirmed releases and closed sessions require confirmation and end evidence', () => {
  const unconfirmedRelease = withLocalFieldState();
  unconfirmedRelease.dailyReleaseBatches[0].confirmedBy = undefined;

  const closedDayWithoutEnd = withLocalFieldState();
  closedDayWithoutEnd.daySessions[0].status = 'closed';
  closedDayWithoutEnd.daySessions[0].endedAt = undefined;

  const closedWalkWithoutEnd = withLocalFieldState();
  closedWalkWithoutEnd.walkSessions[0].endedAt = undefined;

  assert.throws(
    () => parseJsonBackup(JSON.stringify(unconfirmedRelease)),
    /dailyReleaseBatches\.0\.confirmedBy.*confirmed release requires confirmedBy and confirmedAt/,
  );
  assert.throws(
    () => parseJsonBackup(JSON.stringify(closedDayWithoutEnd)),
    /daySessions\.0\.endedAt.*closed Day Session requires endedAt/,
  );
  assert.throws(
    () => parseJsonBackup(JSON.stringify(closedWalkWithoutEnd)),
    /walkSessions\.0\.endedAt.*closed Walk Session requires endedAt/,
  );
});

test('confirmed releases are nonempty and Today Tasks stay inside selected confirmed scope', () => {
  const emptyConfirmedRelease = withLocalFieldState();
  emptyConfirmedRelease.dailyReleaseBatches[0].items = [];

  const taskOutsideConfirmedScope = withLocalFieldState();
  taskOutsideConfirmedScope.todayTasks[0].section = 'B';

  assert.throws(
    () => parseJsonBackup(JSON.stringify(emptyConfirmedRelease)),
    /dailyReleaseBatches\.0\.items.*requires at least one released Unit, trade, and section item/,
  );
  assert.throws(
    () => parseJsonBackup(JSON.stringify(taskOutsideConfirmedScope)),
    /todayTasks\.0.*scope must exist in a confirmed release selected for its Day Session/,
  );
});

test('Day Sessions require confirmed same-day releases and project-scoped trade-compatible crews', () => {
  const draftRelease = withLocalFieldState();
  draftRelease.dailyReleaseBatches[0].status = 'draft';

  const wrongReleaseDate = withLocalFieldState();
  wrongReleaseDate.dailyReleaseBatches[0].date = '2026-07-27';

  const noActiveRelease = withLocalFieldState();
  noActiveRelease.daySessions[0].releaseBatchIds = [];

  const missingPaintCrew = withLocalFieldState();
  missingPaintCrew.daySessions[0].activePaintCrewIds = ['crew_not_in_backup'];

  const cleanCrewListedAsPaint = withLocalFieldState();
  cleanCrewListedAsPaint.daySessions[0].activePaintCrewIds = ['crew_cleaner'];

  const closedSessionWithSupersededRelease = withLocalFieldState();
  closedSessionWithSupersededRelease.daySessions[0].status = 'closed';
  closedSessionWithSupersededRelease.daySessions[0].endedAt = stamp;
  closedSessionWithSupersededRelease.dailyReleaseBatches[0].status = 'superseded';
  closedSessionWithSupersededRelease.todayTasks[0].status = 'completed';

  assert.throws(
    () => parseJsonBackup(JSON.stringify(draftRelease)),
    /daySessions\.0\.releaseBatchIds\.0.*only a confirmed release batch/,
  );
  assert.throws(
    () => parseJsonBackup(JSON.stringify(wrongReleaseDate)),
    /daySessions\.0\.releaseBatchIds\.0.*must match the Day Session date/,
  );
  assert.throws(
    () => parseJsonBackup(JSON.stringify(noActiveRelease)),
    /daySessions\.0\.releaseBatchIds.*requires a confirmed release batch/,
  );
  assert.throws(
    () => parseJsonBackup(JSON.stringify(missingPaintCrew)),
    /daySessions\.0\.activePaintCrewIds\.0.*must exist in the same project and match the trade/,
  );
  assert.throws(
    () => parseJsonBackup(JSON.stringify(cleanCrewListedAsPaint)),
    /daySessions\.0\.activePaintCrewIds\.0.*must exist in the same project and match the trade/,
  );
  assert.doesNotThrow(() => parseJsonBackup(JSON.stringify(closedSessionWithSupersededRelease)));
});

test('release scope identifiers and Day Session references cannot be duplicated', () => {
  const duplicateDayRelease = withLocalFieldState();
  duplicateDayRelease.daySessions[0].releaseBatchIds.push(duplicateDayRelease.daySessions[0].releaseBatchIds[0]);

  const duplicatePaintCrew = withLocalFieldState();
  duplicatePaintCrew.daySessions[0].activePaintCrewIds.push(duplicatePaintCrew.daySessions[0].activePaintCrewIds[0]);

  const duplicateReleaseScope = withLocalFieldState();
  duplicateReleaseScope.dailyReleaseBatches[0].items.push({
    ...duplicateReleaseScope.dailyReleaseBatches[0].items[0],
    id: 'release_item_duplicate_scope',
  });

  const duplicateReleaseItemId = withLocalFieldState();
  duplicateReleaseItemId.dailyReleaseBatches.push({
    ...duplicateReleaseItemId.dailyReleaseBatches[0],
    id: 'release_second_batch',
    items: [
      {
        ...duplicateReleaseItemId.dailyReleaseBatches[0].items[0],
        trade: 'clean',
      },
    ],
  });

  assert.throws(
    () => parseJsonBackup(JSON.stringify(duplicateDayRelease)),
    /daySessions\.0\.releaseBatchIds\.1.*reference each release batch only once/,
  );
  assert.throws(
    () => parseJsonBackup(JSON.stringify(duplicatePaintCrew)),
    /daySessions\.0\.activePaintCrewIds\.1.*reference each active crew only once/,
  );
  assert.throws(
    () => parseJsonBackup(JSON.stringify(duplicateReleaseScope)),
    /dailyReleaseBatches\.0\.items\.1.*Unit, trade, and section scope only once/,
  );
  assert.throws(
    () => parseJsonBackup(JSON.stringify(duplicateReleaseItemId)),
    /dailyReleaseBatches\.1\.items\.0\.id.*Duplicate release item id/,
  );
});

test('Today Task dates and Field Event reversals preserve their project lifecycle', () => {
  const wrongTaskDate = withLocalFieldState();
  wrongTaskDate.todayTasks[0].date = '2026-07-27';

  const missingReversedEvent = withLocalFieldState();
  missingReversedEvent.fieldEvents[0].reversesEventId = 'field_event_not_in_backup';

  const selfReversingEvent = withLocalFieldState();
  selfReversingEvent.fieldEvents[0].reversesEventId = selfReversingEvent.fieldEvents[0].id;

  assert.throws(
    () => parseJsonBackup(JSON.stringify(wrongTaskDate)),
    /todayTasks\.0\.date.*must match its Day Session date/,
  );
  assert.throws(
    () => parseJsonBackup(JSON.stringify(missingReversedEvent)),
    /fieldEvents\.0\.reversesEventId.*must reference a different event in the same Day Session/,
  );
  assert.throws(
    () => parseJsonBackup(JSON.stringify(selfReversingEvent)),
    /fieldEvents\.0\.reversesEventId.*must reference a different event in the same Day Session/,
  );
});

test('Field Event reversal history cannot cross Day Session boundaries', () => {
  const crossSessionReversal = withLocalFieldState();
  crossSessionReversal.daySessions.push({
    ...crossSessionReversal.daySessions[0],
    id: 'day_session_closed',
    status: 'closed',
    endedAt: minutesAfterStamp(1),
    updatedAt: minutesAfterStamp(1),
  });
  crossSessionReversal.fieldEvents.push({
    ...crossSessionReversal.fieldEvents[0],
    id: 'field_event_cross_session_reversal',
    daySessionId: 'day_session_closed',
    eventType: 'event-reversed',
    recordedAt: minutesAfterStamp(1),
    reversesEventId: crossSessionReversal.fieldEvents[0].id,
  });

  const sameSessionReversal = withLocalFieldState();
  sameSessionReversal.fieldEvents.push({
    ...sameSessionReversal.fieldEvents[0],
    id: 'field_event_callback_opened',
    eventType: 'callback-opened',
    recordedAt: minutesAfterStamp(1),
    summary: 'Callback opened.',
  });
  sameSessionReversal.fieldEvents.push({
    ...sameSessionReversal.fieldEvents[0],
    id: 'field_event_callback_reversed',
    eventType: 'event-reversed',
    recordedAt: minutesAfterStamp(2),
    reversesEventId: 'field_event_callback_opened',
    summary: 'Callback entry reversed in the same Day Session.',
  });
  sameSessionReversal.walkSessions[0] = {
    ...sameSessionReversal.walkSessions[0],
    createdAt: minutesAfterStamp(3),
    startedAt: minutesAfterStamp(3),
    endedAt: minutesAfterStamp(4),
    updatedAt: minutesAfterStamp(4),
  };
  sameSessionReversal.daySessions[0].updatedAt = minutesAfterStamp(4);

  assert.throws(
    () => parseJsonBackup(JSON.stringify(crossSessionReversal)),
    /fieldEvents\.1\.reversesEventId.*must reference a different event in the same Day Session/,
  );
  assert.doesNotThrow(() => parseJsonBackup(JSON.stringify(sameSessionReversal)));
});

test('property-accepted walk outcomes require current same-session Los-pass evidence', () => {
  const missingLosPass = withLocalFieldState();
  missingLosPass.fieldEvents = [];

  const crossSessionLosPass = withLocalFieldState();
  crossSessionLosPass.daySessions.push({
    ...crossSessionLosPass.daySessions[0],
    id: 'day_session_other',
    status: 'closed',
    endedAt: stamp,
  });
  crossSessionLosPass.fieldEvents[0].daySessionId = 'day_session_other';

  assert.throws(
    () => parseJsonBackup(JSON.stringify(missingLosPass)),
    /walkSessions\.0\.outcomes\.0\.outcome.*requires a current Los-pass event from the same Day Session/,
  );
  assert.throws(
    () => parseJsonBackup(JSON.stringify(crossSessionLosPass)),
    /walkSessions\.0\.outcomes\.0\.outcome.*requires a current Los-pass event from the same Day Session/,
  );
});

test('property-accepted walk outcomes reject blocked or already-accepted scope', () => {
  const blockedAfterLosPass = withLocalFieldState();
  blockedAfterLosPass.fieldEvents[0].recordedAt = minutesAfterStamp(1);
  blockedAfterLosPass.fieldEvents.push({
    ...blockedAfterLosPass.fieldEvents[0],
    id: 'field_event_callback_opened',
    eventType: 'callback-opened',
    recordedAt: minutesAfterStamp(2),
    summary: 'Callback remains open.',
  });
  blockedAfterLosPass.walkSessions[0] = {
    ...blockedAfterLosPass.walkSessions[0],
    startedAt: minutesAfterStamp(3),
    endedAt: minutesAfterStamp(4),
    createdAt: minutesAfterStamp(3),
    updatedAt: minutesAfterStamp(4),
  };
  blockedAfterLosPass.daySessions[0].updatedAt = minutesAfterStamp(4);

  const alreadyAccepted = withLocalFieldState();
  alreadyAccepted.fieldEvents[0].recordedAt = minutesAfterStamp(1);
  alreadyAccepted.fieldEvents.push({
    ...alreadyAccepted.fieldEvents[0],
    id: 'field_event_property_accepted',
    eventType: 'property-accepted',
    recordedAt: minutesAfterStamp(2),
    summary: 'Property acceptance was already recorded.',
  });
  alreadyAccepted.walkSessions[0] = {
    ...alreadyAccepted.walkSessions[0],
    startedAt: minutesAfterStamp(3),
    endedAt: minutesAfterStamp(4),
    createdAt: minutesAfterStamp(3),
    updatedAt: minutesAfterStamp(4),
  };
  alreadyAccepted.daySessions[0].updatedAt = minutesAfterStamp(4);

  assert.throws(
    () => parseJsonBackup(JSON.stringify(blockedAfterLosPass)),
    /walkSessions\.0\.outcomes\.0\.outcome.*requires the selected scope to be unblocked after Los pass/,
  );
  assert.throws(
    () => parseJsonBackup(JSON.stringify(alreadyAccepted)),
    /walkSessions\.0\.outcomes\.0\.outcome.*cannot be recorded again for scope already accepted/,
  );
});

test('overlapping closed walks cannot both accept the same Day Session scope', () => {
  const overlappingAcceptedWalks = withLocalFieldState();
  overlappingAcceptedWalks.fieldEvents[0].recordedAt = minutesAfterStamp(1);
  overlappingAcceptedWalks.walkSessions[0] = {
    ...overlappingAcceptedWalks.walkSessions[0],
    startedAt: minutesAfterStamp(2),
    endedAt: minutesAfterStamp(5),
    createdAt: minutesAfterStamp(2),
    updatedAt: minutesAfterStamp(5),
  };
  overlappingAcceptedWalks.walkSessions.push({
    ...overlappingAcceptedWalks.walkSessions[0],
    id: 'walk_session_overlapping_acceptance',
    startedAt: minutesAfterStamp(3),
    endedAt: minutesAfterStamp(4),
    createdAt: minutesAfterStamp(3),
    updatedAt: minutesAfterStamp(4),
  });
  overlappingAcceptedWalks.daySessions[0].updatedAt = minutesAfterStamp(5);

  assert.throws(
    () => parseJsonBackup(JSON.stringify(overlappingAcceptedWalks)),
    /walkSessions\.[01]\.outcomes\.0\.outcome.*cannot be recorded again for scope already accepted/,
  );
});

test('Walk Sessions stay scoped to one Day Session and close with complete outcomes', () => {
  const unknownSelection = withLocalFieldState();
  unknownSelection.walkSessions[0].selectedItemIds = ['release_item_not_in_day'];
  unknownSelection.walkSessions[0].outcomes = [
    { selectedItemId: 'release_item_not_in_day', outcome: 'accepted' },
  ];

  const duplicateSelection = withLocalFieldState();
  duplicateSelection.walkSessions[0].selectedItemIds.push(duplicateSelection.walkSessions[0].selectedItemIds[0]);

  const incompleteClosedWalk = withLocalFieldState();
  incompleteClosedWalk.walkSessions[0].outcomes = [];

  const duplicateActiveWalk = withLocalFieldState();
  duplicateActiveWalk.walkSessions[0].status = 'active';
  duplicateActiveWalk.walkSessions[0].endedAt = undefined;
  duplicateActiveWalk.walkSessions.push({
    ...duplicateActiveWalk.walkSessions[0],
    id: 'walk_session_second_active',
  });

  const activeWalkWithEndTime = withLocalFieldState();
  activeWalkWithEndTime.walkSessions[0].status = 'active';

  const walkBeforeDayStart = withLocalFieldState();
  walkBeforeDayStart.daySessions[0].status = 'not-started';

  const activeWalkAfterDayClose = withLocalFieldState();
  activeWalkAfterDayClose.daySessions[0].status = 'closed';
  activeWalkAfterDayClose.daySessions[0].endedAt = stamp;
  activeWalkAfterDayClose.todayTasks[0].status = 'completed';
  activeWalkAfterDayClose.walkSessions[0].status = 'active';
  activeWalkAfterDayClose.walkSessions[0].endedAt = undefined;

  assert.throws(
    () => parseJsonBackup(JSON.stringify(unknownSelection)),
    /walkSessions\.0\.selectedItemIds\.0.*must reference a release item from the same Day Session/,
  );
  assert.throws(
    () => parseJsonBackup(JSON.stringify(duplicateSelection)),
    /walkSessions\.0\.selectedItemIds.*select each release item only once/,
  );
  assert.throws(
    () => parseJsonBackup(JSON.stringify(incompleteClosedWalk)),
    /walkSessions\.0\.selectedItemIds\.0.*requires one outcome for every selected item/,
  );
  assert.throws(
    () => parseJsonBackup(JSON.stringify(duplicateActiveWalk)),
    /walkSessions\.1\.status.*Only one active Walk Session is allowed per Day Session/,
  );
  assert.throws(
    () => parseJsonBackup(JSON.stringify(activeWalkWithEndTime)),
    /walkSessions\.0\.endedAt.*active Walk Session cannot have endedAt/,
  );
  assert.throws(
    () => parseJsonBackup(JSON.stringify(walkBeforeDayStart)),
    /walkSessions\.0\.daySessionId.*cannot begin before its Day Session starts/,
  );
  assert.throws(
    () => parseJsonBackup(JSON.stringify(activeWalkAfterDayClose)),
    /walkSessions\.0\.status.*cannot remain open after its Day Session closes/,
  );
});

test('AI budget and minimal usage telemetry survive backup validation', () => {
  const data = cloneSeed();
  data.projects[0].aiBudgetUsd = 15;
  data.aiUsageEvents = [
    {
      id: 'ai_usage_backup',
      projectId: data.activeProjectId,
      task: 'capture',
      model: 'gpt-5.4-nano',
      modelClass: 'fast',
      routeReason: 'Focused capture uses the lowest-cost capable model.',
      inputTokens: 1_000,
      cachedInputTokens: 100,
      outputTokens: 400,
      totalTokens: 1_400,
      estimatedCostUsd: 0.0007,
      pricingVersion: '2026-07-10',
      createdAt: '2026-07-10T13:00:00.000Z',
      updatedAt: '2026-07-10T13:00:00.000Z',
    },
  ];

  const restored = parseJsonBackup(buildJsonBackup(data));

  assert.equal(restored.projects[0].aiBudgetUsd, 15);
  assert.deepEqual(restored.aiUsageEvents, data.aiUsageEvents);
});

test('invalid JSON and empty project backups fail before local replacement', () => {
  assert.throws(() => parseJsonBackup('{broken'), /not valid JSON.*No local data was changed/);
  assert.throws(
    () => parseJsonBackup(JSON.stringify({ activeProjectId: 'missing', projects: [] })),
    /projects.*No local data was changed/,
  );
});

test('malformed collections and records are rejected instead of being normalized into silent data loss', () => {
  const malformedCollection = { ...cloneSeed(), units: { id: 'not-an-array' } };
  const malformedRecord = { ...cloneSeed(), issues: [{ title: 'Missing id' }] };
  const unsafeUnit = { ...cloneSeed(), units: [{ id: 'unit_missing_runtime_fields' }] };
  const invalidStatus = cloneSeed();
  invalidStatus.units[0] = { ...invalidStatus.units[0], overallStatus: 'Impossible state' as never };

  assert.throws(() => parseJsonBackup(JSON.stringify(malformedCollection)), /units/);
  assert.throws(() => parseJsonBackup(JSON.stringify(malformedRecord)), /issues\.0\.id/);
  assert.throws(() => parseJsonBackup(JSON.stringify(unsafeUnit)), /units\.0\.projectId/);
  assert.throws(() => parseJsonBackup(JSON.stringify(invalidStatus)), /units\.0\.overallStatus.*Invalid Unit status/);
});

test('a valid embedded photo payload remains available for post-restore IndexedDB migration', () => {
  const data = cloneSeed();
  data.photoNotes = [
    {
      id: 'photo_valid_backup',
      projectId: data.activeProjectId,
      unitId: data.units[0].id,
      category: 'Problem',
      caption: 'Valid recovery photo',
      imageData: 'data:image/jpeg;base64,AQID',
      createdAt: '2026-07-09T12:00:00.000Z',
      updatedAt: '2026-07-09T12:00:00.000Z',
    },
  ];

  const restored = parseJsonBackup(JSON.stringify(data));

  assert.equal(restored.photoNotes[0]?.imageData, 'data:image/jpeg;base64,AQID');
});

test('duplicate record ids and invalid embedded photo data are rejected', () => {
  const duplicateUnits = cloneSeed();
  duplicateUnits.units = [duplicateUnits.units[0], { ...duplicateUnits.units[0] }];

  const invalidPhoto = cloneSeed();
  invalidPhoto.photoNotes = [
    {
      id: 'photo_invalid_backup',
      projectId: invalidPhoto.activeProjectId,
      category: 'Problem',
      caption: 'Invalid payload',
      imageData: 'not-a-data-url',
      createdAt: '2026-07-09T12:00:00.000Z',
      updatedAt: '2026-07-09T12:00:00.000Z',
    },
  ];
  const unsupportedPhoto = cloneSeed();
  unsupportedPhoto.photoNotes = [
    {
      ...invalidPhoto.photoNotes[0],
      id: 'photo_unsupported_backup',
      imageData: 'data:text/html;base64,PGgxPk5vdCBhIHBob3RvPC9oMT4=',
    },
  ];

  assert.throws(() => parseJsonBackup(JSON.stringify(duplicateUnits)), /Duplicate record id/);
  assert.throws(() => parseJsonBackup(JSON.stringify(invalidPhoto)), /imageData is invalid, unsupported, or too large/);
  assert.throws(() => parseJsonBackup(JSON.stringify(unsupportedPhoto)), /imageData is invalid, unsupported, or too large/);
});

test('a stale active project id safely falls back to a project contained in the backup', () => {
  const data = cloneSeed();
  data.activeProjectId = 'project_missing_from_backup';

  const restored = parseJsonBackup(JSON.stringify(data));

  assert.equal(restored.activeProjectId, restored.projects[0].id);
});

test('project-scoped Memory and candidate provenance survive backup validation', () => {
  const data = cloneSeed();
  data.memories = [
    {
      id: 'memory_scoped_backup',
      projectId: data.activeProjectId,
      memoryType: 'Crew Memory',
      content: 'Jose crew handles painting.',
      source: 'Approved Capture review',
      sourceEntityId: 'candidate_scoped_backup',
      confidence: 0.9,
      approved: true,
      createdAt: '2026-07-09T12:00:00.000Z',
      updatedAt: '2026-07-09T12:00:00.000Z',
    },
  ];
  data.memoryCandidates = [
    {
      id: 'candidate_scoped_backup',
      projectId: data.activeProjectId,
      memoryType: 'Crew Memory',
      content: 'Jose crew handles painting.',
      source: 'Capture',
      sourceEntityId: 'activity_scoped_backup',
      confidence: 0.9,
      status: 'approved',
      createdAt: '2026-07-09T12:00:00.000Z',
      updatedAt: '2026-07-09T12:00:00.000Z',
    },
  ];

  const restored = parseJsonBackup(buildJsonBackup(data));

  assert.equal(restored.memories[0]?.projectId, data.activeProjectId);
  assert.equal(restored.memories[0]?.sourceEntityId, 'candidate_scoped_backup');
  assert.equal(restored.memoryCandidates[0]?.projectId, data.activeProjectId);
  assert.equal(restored.memoryCandidates[0]?.sourceEntityId, 'activity_scoped_backup');
});
