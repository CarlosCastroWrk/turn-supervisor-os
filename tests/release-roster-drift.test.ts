import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import {
  appendManualReleaseBatchOnce,
  createManualReleaseBatch,
  projectDailyReleases,
  projectPropertyRoster,
} from '../src/features/wave2a2-core/appDataAdapters.ts';
import { createTodayTask } from '../src/features/wave2a2-track-b/model.ts';

// Field bug (Aug 6, Moon Tower): Los released rooms, then corrected a unit's
// bed count (a misread unit). One released bedroom no longer fit the roster, so
// the WHOLE day's TodayTask threw and every surface that catches the throw
// blanked to null — hiding valid work (his common-area releases) while the
// dedup guard still reported "already released today". A single bad section must
// never take the whole board down, and dropped rooms must be surfaced, not
// silently swallowed.

const date = '2026-08-06';
const recordedAt = '2026-08-06T12:00:00.000Z';

const release = (data: typeof seedData, selections: Array<{ section: string; trade: string; unitId: string }>, id: string) =>
  createManualReleaseBatch({
    actor: 'Los',
    date,
    id,
    propertyContact: 'PM',
    recordedAt,
    roster: projectPropertyRoster(data),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    selections: selections as any,
  });

test('common-only paint release stays visible in Today’s Task', () => {
  let data = structuredClone(seedData);
  data = appendManualReleaseBatchOnce(
    data,
    release(data, [{ section: 'common', trade: 'paint', unitId: 'unit_101' }], 'r-common'),
  );
  const task = createTodayTask(projectPropertyRoster(data), projectDailyReleases(data), date, 's1');
  const commons = (task?.sections ?? []).filter((section) => section.sectionId === 'common');
  assert.equal(commons.length, 1, 'common-area paint release must project into the task');
});

test('a roster-incompatible section is dropped alone — it never blanks the whole day', () => {
  let data = structuredClone(seedData);
  // Release bedroom C on unit_101 (valid at 3 beds) + common on unit_102.
  data = appendManualReleaseBatchOnce(
    data,
    release(data, [
      { section: 'C', trade: 'paint', unitId: 'unit_101' },
      { section: 'common', trade: 'paint', unitId: 'unit_102' },
    ], 'r-drift'),
  );
  // Los corrects unit_101 down to 2 beds — bedroom C leaves the roster.
  const unit101 = data.units.find((unit) => unit.id === 'unit_101');
  assert.ok(unit101);
  unit101.bedCount = 2;

  const task = createTodayTask(projectPropertyRoster(data), projectDailyReleases(data), date, 's2');
  assert.ok(task, 'task must survive — one corrected room cannot blank the board');
  const keys = task.sections.map((section) => `${section.unitId}:${section.sectionId}`);
  assert.ok(keys.includes('unit_102:common'), 'unrelated valid work must remain visible');
  assert.ok(!keys.includes('unit_101:C'), 'the corrected-away bedroom must not show');
  assert.equal(task.droppedReleases?.length, 1, 'the dropped room is surfaced, not silent');
  assert.match(task.droppedReleases?.[0] ?? '', /Unit 101/, 'the warning names the affected unit');
});

test('a release from another property is ignored, not crashed on', () => {
  const data = structuredClone(seedData);
  const roster = projectPropertyRoster(data);
  const foreignRoster = { ...roster, propertyId: 'project_other' };
  const batch = release(data, [{ section: 'common', trade: 'paint', unitId: 'unit_101' }], 'r-foreign');
  // Cross-property releases are filtered out before projection, so the task is
  // simply empty (null) rather than throwing and taking a surface down.
  assert.equal(createTodayTask(foreignRoster, [batch], date, 's3'), null);
});
