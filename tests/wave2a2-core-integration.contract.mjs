import assert from 'node:assert/strict';
import test from 'node:test';
import { OFFICIAL_PDS_LINKS } from '../src/config/officialPdsLinks.ts';
import { seedData } from '../src/data/seed.ts';
import {
  applyDayTaskStateChange,
  applyTrackCStateChange,
  appendManualReleaseBatchOnce,
  createManualReleaseBatch,
  projectDailyReleases,
  projectDaySessions,
  projectPropertyRoster,
  projectTodayTask,
  projectTrackCState,
} from '../src/features/wave2a2-core/appDataAdapters.ts';
import {
  createTodayTask,
  createTodayTaskGoal,
  startDaySession,
} from '../src/features/wave2a2-track-b/model.ts';
import {
  confirmTrackCBulkAssignmentProposal,
  createTrackCBulkAssignmentProposal,
} from '../src/features/wave2a2-track-c/operations.ts';
import {
  projectTrackCWork,
} from '../src/features/wave2a2-track-c/projections.ts';

const cloneSeed = () => structuredClone(seedData);
const date = '2026-08-01';
const recordedAt = '2026-08-01T12:00:00.000Z';

const createRelease = (data, selections = [
  { section: 'common', trade: 'paint', unitId: 'unit_101' },
  { section: 'A', trade: 'clean', unitId: 'unit_101' },
]) => createManualReleaseBatch({
  actor: 'Los',
  date,
  id: 'manual-release-contract',
  propertyContact: 'Property contact',
  recordedAt,
  roster: projectPropertyRoster(data),
  selections,
});

const startAcceptedDay = (data) => {
  const roster = projectPropertyRoster(data);
  const releases = projectDailyReleases(data);
  const task = createTodayTask(roster, releases, date, 'day-session-contract');
  assert.ok(task);
  const result = startDaySession({
    accountId: 'local-contract-device',
    activeCrewIdsByTrade: {
      Clean: ['crew_cleaner'],
      Paint: ['crew_painter'],
    },
    assignmentEvidenceReviewNote: 'Reviewed the explicit synthetic release.',
    crewReviewConfirmed: { Clean: true, Paint: true },
    date,
    daySessionId: 'day-session-contract',
    explicitConfirmation: true,
    goal: createTodayTaskGoal(task),
    keyStatus: 'yes',
    propertyContact: 'Property contact',
    propertyId: data.activeProjectId,
    releaseBatchIds: releases.map((release) => release.id),
    startedBy: 'Los',
    walkthroughScheduleWording: 'Daily property walk at noon.',
    workingHoursWording: 'Synthetic test hours only.',
  }, releases, roster, [], recordedAt);
  assert.deepEqual(result.errors, []);
  assert.ok(result.session);
  assert.ok(result.startEvent);
  return applyDayTaskStateChange(data, {
    event: result.startEvent,
    reason: 'day-started',
    recordedAt: result.startEvent.recordedAt,
    session: result.session,
  });
};

test('manual release fallback uses only known roster scope and preserves legacy records', () => {
  const data = cloneSeed();
  const legacySnapshot = {
    activityLogs: structuredClone(data.activityLogs),
    assignments: structuredClone(data.assignments),
    dailyLogs: structuredClone(data.dailyLogs),
    issues: structuredClone(data.issues),
    photoNotes: structuredClone(data.photoNotes),
  };
  const roster = projectPropertyRoster(data);
  const release = createRelease(data, [
    { section: 'common', trade: 'paint', unitId: 'unit_101' },
    { section: 'common', trade: 'paint', unitId: 'unit_101' },
    { section: 'A', trade: 'clean', unitId: 'unit_101' },
  ]);

  assert.equal(roster.units.length, data.units.length);
  assert.deepEqual(
    roster.units.find((unit) => unit.id === 'unit_101')?.applicableSections
      .map((section) => section.id),
    ['common', 'A', 'B', 'C'],
  );
  assert.equal(release.items.length, 2, 'duplicate manual selections must collapse');
  assert.equal(release.sourceType, 'manual');
  assert.equal(release.status, 'confirmed');
  assert.equal(release.propertyContact, 'Property contact');
  assert.deepEqual(
    release.items.map((item) => `${item.unitId}:${item.section}:${item.trade}`),
    ['unit_101:A:clean', 'unit_101:common:paint'],
  );
  assert.deepEqual({
    activityLogs: data.activityLogs,
    assignments: data.assignments,
    dailyLogs: data.dailyLogs,
    issues: data.issues,
    photoNotes: data.photoNotes,
  }, legacySnapshot);
  assert.throws(
    () => createManualReleaseBatch({
      actor: 'Los',
      date,
      id: 'manual-release-no-contact',
      propertyContact: '   ',
      recordedAt,
      roster,
      selections: [{ section: 'common', trade: 'paint', unitId: 'unit_101' }],
    }),
    /property contact/u,
  );
  assert.throws(
    () => createManualReleaseBatch({
      actor: 'Los',
      date,
      id: 'manual-release-not-roster-scope',
      propertyContact: 'Property contact',
      recordedAt,
      roster,
      selections: [{ section: 'D', trade: 'paint', unitId: 'unit_101' }],
    }),
    /not present in the existing roster/u,
  );
});

test('rapid Manual Release double-confirm cannot append duplicate local batches', () => {
  const initial = cloneSeed();
  const batch = createRelease(initial);
  const afterFirstConfirm = appendManualReleaseBatchOnce(initial, batch);
  const afterRapidSecondConfirm = appendManualReleaseBatchOnce(afterFirstConfirm, batch);

  assert.equal(
    afterRapidSecondConfirm.dailyReleaseBatches.filter(
      (candidate) => candidate.id === batch.id,
    ).length,
    1,
  );
  assert.equal(
    afterRapidSecondConfirm,
    afterFirstConfirm,
    'a duplicate confirmation must return the unchanged AppData snapshot',
  );
});

test('Day Session adapter persists exact boundaries without duplicate local events', () => {
  const initial = cloneSeed();
  const withRelease = {
    ...initial,
    dailyReleaseBatches: [createRelease(initial)],
  };
  const persisted = startAcceptedDay(withRelease);
  const sessions = projectDaySessions(persisted, 'local-contract-device');
  const active = sessions[0];
  const task = projectTodayTask(persisted, active);

  assert.equal(persisted.daySessions.length, 1);
  assert.equal(active?.startedAt, recordedAt);
  assert.equal(active?.workingHoursWording, 'Synthetic test hours only.');
  assert.equal(active?.walkthroughScheduleWording, 'Daily property walk at noon.');
  assert.equal(
    active?.assignmentEvidenceReviewNote,
    'Reviewed the explicit synthetic release.',
  );
  assert.equal(task?.sections.length, 2);

  const repeated = applyDayTaskStateChange(persisted, {
    event: {
      actorId: 'Los',
      actorType: 'los',
      daySessionId: 'day-session-contract',
      eventId: 'day-session-contract:start',
      eventType: 'day-session-started',
      personalOfficialBoundary: 'personal-record-only',
      propertyId: persisted.activeProjectId,
      recordedAt,
      recordedBy: 'Los',
      sourceId: 'manual-release-contract',
      sourceType: 'day-session',
      summary: 'Los explicitly started the personal Day Session.',
    },
    reason: 'day-started',
    recordedAt,
    session: active,
  });
  assert.equal(repeated.daySessions.length, 1);
  assert.equal(
    repeated.fieldEvents.filter((event) => event.id === 'day-session-contract:start').length,
    1,
  );
  assert.equal(
    repeated.fieldEvents.filter((event) =>
      event.id.startsWith('day-session-contract:day-')).length,
    3,
  );
});

test('field truth still persists after the day session is CLOSED (evening inspection)', () => {
  // Los walks and inspects units in the evening, after End Day has closed the
  // session. Recording a pass / callback resolution / acceptance then must still
  // persist — it used to throw ("requires one active Day Session") and the write
  // silently reverted, so a cleared callback popped back red. It now falls back
  // to the most recent day session.
  const initial = cloneSeed();
  const activeData = startAcceptedDay({ ...initial, dailyReleaseBatches: [createRelease(initial)] });
  const closed = {
    ...activeData,
    daySessions: activeData.daySessions.map((session) => ({ ...session, status: 'closed' })),
  };

  const trackC = projectTrackCState(closed);
  const proposal = createTrackCBulkAssignmentProposal(trackC, {
    createdAt: '2026-08-01T20:00:00.000Z', createdBy: 'Los', crewId: 'crew_painter',
    proposalId: 'evening-proposal', sectionMode: 'specific', sections: ['common'],
    trade: 'paint', unitIds: ['unit_101'],
  });
  const result = confirmTrackCBulkAssignmentProposal(trackC, proposal, {
    confirmed: true, eventIdPrefix: 'evening-assign',
    recordedAt: '2026-08-01T20:01:00.000Z', recordedBy: 'Los',
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  // Must NOT throw, and the new event must actually be written.
  const persisted = applyTrackCStateChange(closed, result.value.state);
  assert.equal(
    persisted.fieldEvents.filter((event) => event.eventType === 'assignment-confirmed').length,
    1,
    'the evening write persisted despite the closed session',
  );
});

test('Track C adapter keeps release, assignment, crew report, inspection, and paper boundaries separate', () => {
  const initial = cloneSeed();
  const withRelease = {
    ...initial,
    dailyReleaseBatches: [createRelease(initial)],
  };
  const activeData = startAcceptedDay(withRelease);
  const trackC = projectTrackCState(activeData);
  const paint = projectTrackCWork(trackC, {
    section: 'common',
    trade: 'paint',
    unitId: 'unit_101',
  });
  const clean = projectTrackCWork(trackC, {
    section: 'common',
    trade: 'clean',
    unitId: 'unit_101',
  });

  assert.equal(paint?.release, 'released');
  assert.equal(paint?.execution, 'unassigned');
  assert.equal(paint?.inspection, 'not-ready');
  assert.equal(paint?.property, 'not-ready');
  assert.equal(paint?.personalPdsMirror, false);
  assert.equal(clean?.release, 'unreleased', 'Paint release must not imply Clean release');

  const proposal = createTrackCBulkAssignmentProposal(trackC, {
    createdAt: '2026-08-01T12:05:00.000Z',
    createdBy: 'Los',
    crewId: 'crew_painter',
    proposalId: 'proposal-contract',
    sectionMode: 'specific',
    sections: ['common'],
    trade: 'paint',
    unitIds: ['unit_101'],
  });
  const result = confirmTrackCBulkAssignmentProposal(trackC, proposal, {
    confirmed: true,
    eventIdPrefix: 'assignment-contract',
    recordedAt: '2026-08-01T12:06:00.000Z',
    recordedBy: 'Los',
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const once = applyTrackCStateChange(activeData, result.value.state);
  const twice = applyTrackCStateChange(once, result.value.state);
  const assignmentEvents = twice.fieldEvents.filter((event) =>
    event.eventType === 'assignment-confirmed');
  assert.equal(assignmentEvents.length, 1);
  assert.equal(assignmentEvents[0]?.boundary, 'personal-record');
  assert.equal(assignmentEvents[0]?.actorId, 'Los');
  assert.equal(assignmentEvents[0]?.actorType, 'los');
  assert.equal(assignmentEvents[0]?.reportedBy, 'crew_painter');
  assert.equal(twice.walkSessions.length, 0);
  assert.deepEqual(twice.assignments, initial.assignments);
  assert.deepEqual(twice.activityLogs, initial.activityLogs);
  assert.deepEqual(twice.photoNotes, initial.photoNotes);
});

test('accepted adapters remain bounded at 100 and 500 roster Units', () => {
  const base = cloneSeed();
  for (const count of [100, 500]) {
    const data = {
      ...base,
      units: Array.from({ length: count }, (_, index) => ({
        ...base.units[index % base.units.length],
        id: `scale-unit-${count}-${index + 1}`,
        unitNumber: String(index + 1).padStart(4, '0'),
      })),
    };
    const roster = projectPropertyRoster(data);
    const fieldState = projectTrackCState(data);
    assert.equal(roster.units.length, count);
    assert.equal(fieldState.units.length, count);
    assert.equal(
      fieldState.units.every((unit) =>
        unit.workFacts.length === unit.applicableSections.length * 2),
      true,
    );
  }
});

test('official PDS links are explicit HTTPS destinations with no embedded submission data', () => {
  assert.deepEqual(
    OFFICIAL_PDS_LINKS.map((link) => link.label),
    [
      'Change Order Approval',
      'Backup Safety Submission Box',
      'Turn Sign-Off Form',
    ],
  );
  for (const link of OFFICIAL_PDS_LINKS) {
    const url = new URL(link.url);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.hostname, 'pds.jotform.com');
    assert.equal(url.search, '');
    assert.equal(url.hash, '');
  }
});
