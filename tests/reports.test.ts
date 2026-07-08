import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import { buildDailyActivitySnapshot, buildDailyReport, buildDailyReportPreview } from '../src/lib/exporters.ts';
import { formatDate, todayISO } from '../src/lib/constants.ts';
import type { ActivityLog, AppData, DailyLog } from '../src/types.ts';

const cloneSeed = (): AppData => JSON.parse(JSON.stringify(seedData)) as AppData;
const localTimestamp = (date: string, time: string) => new Date(`${date}T${time}:00`).toISOString();

test('buildDailyReport uses the selected report date even when no daily log exists', () => {
  const data = cloneSeed();
  const project = data.projects.find((item) => item.id === data.activeProjectId);
  assert.ok(project);

  const selectedDate = '2026-01-15';
  const report = buildDailyReport(data, project, selectedDate);

  assert.match(report, new RegExp(`Date: ${formatDate(selectedDate)}`));
  if (todayISO() !== selectedDate) {
    assert.doesNotMatch(report, new RegExp(`Date: ${formatDate(todayISO())}`));
  }
  assert.match(report, /DRAFT - Missing Daily Log for selected date/);
});

test('buildDailyReport does not export placeholder report text as real work', () => {
  const data = cloneSeed();
  const project = data.projects.find((item) => item.id === data.activeProjectId);
  assert.ok(project);

  const report = buildDailyReport(data, project, '2026-01-15');

  assert.doesNotMatch(report, /Add completed work before sending/);
  assert.doesNotMatch(report, /1\\.\\s+2\\.\\s+3\\./);
  assert.match(report, /No completed summary saved for this date/);
  assert.match(report, /No tomorrow priorities saved for this date/);
});

test('buildDailyReport includes saved daily log content for the selected date', () => {
  const data = cloneSeed();
  const project = data.projects.find((item) => item.id === data.activeProjectId);
  assert.ok(project);
  const dailyLog: DailyLog = {
    id: 'daily_test',
    projectId: project.id,
    date: '2026-01-15',
    morningPlan: '',
    middayUpdate: '',
    endOfDayReflection: '',
    completedSummary: 'Paint finished in units 201-204.',
    blockers: 'Keys missing for 205.',
    lessons: '',
    tomorrowPriorities: 'Walk 205 first.',
    createdAt: '2026-01-15T12:00:00.000Z',
    updatedAt: '2026-01-15T12:00:00.000Z',
  };

  const report = buildDailyReport(data, project, dailyLog.date, dailyLog);

  assert.match(report, /DRAFT - Saved daily log found for this date/);
  assert.match(report, /Paint finished in units 201-204/);
  assert.match(report, /Keys missing for 205/);
  assert.match(report, /Walk 205 first/);
});

test('buildDailyReportPreview structures missing daily log output for print review', () => {
  const data = cloneSeed();
  const project = data.projects.find((item) => item.id === data.activeProjectId);
  assert.ok(project);

  const preview = buildDailyReportPreview(data, project, '2026-01-15');

  assert.equal(preview.title, 'Turn Supervisor Daily Report');
  assert.equal(preview.isMissingDailyLog, true);
  assert.match(preview.status, /Missing Daily Log/);
  assert.match(preview.summary, /Draft shell for Jan 15, 2026/);
  assert.equal(preview.metrics.some((metric) => metric.label === 'Ready'), true);
  assert.equal(preview.metrics.every((metric) => /Current board state|ready now/.test(metric.helper)), true);
  assert.deepEqual(
    preview.sections.find((section) => section.title === 'Activity Snapshot')?.items,
    ['No recorded app activity for this date.'],
  );
  assert.equal(preview.sections.find((section) => section.title === 'Open Issues')?.subtitle, 'Items still requiring follow-up');
  assert.deepEqual(
    preview.sections.find((section) => section.title === 'Tomorrow Priorities')?.items,
    ['No tomorrow priorities saved for this date.'],
  );
});

test('buildDailyReportPreview includes saved daily log sections and report recipient metadata', () => {
  const data = cloneSeed();
  const project = data.projects.find((item) => item.id === data.activeProjectId);
  assert.ok(project);
  const dailyLog: DailyLog = {
    id: 'daily_preview',
    projectId: project.id,
    date: '2026-01-15',
    morningPlan: '',
    middayUpdate: '',
    endOfDayReflection: '',
    completedSummary: 'Paint finished in units 201-204.\nCleaners finished 103.',
    blockers: 'Keys missing for 205.',
    lessons: '',
    tomorrowPriorities: 'Walk 205 first.',
    createdAt: '2026-01-15T12:00:00.000Z',
    updatedAt: '2026-01-15T12:00:00.000Z',
  };

  const preview = buildDailyReportPreview(data, project, dailyLog.date, dailyLog);

  assert.equal(preview.isMissingDailyLog, false);
  assert.equal(preview.projectManagerName, project.projectManagerName);
  assert.match(preview.summary, /priority issue/);
  assert.equal(preview.sections[0]?.title, 'Activity Snapshot');
  assert.deepEqual(preview.sections.find((section) => section.title === 'Completed Today')?.items, [
    'Paint finished in units 201-204.',
    'Cleaners finished 103.',
  ]);
  assert.deepEqual(preview.sections.find((section) => section.title === 'Questions / Needs')?.items, ['Keys missing for 205.']);
});

test('buildDailyActivitySnapshot scopes activity to selected date, project, and operational events', () => {
  const data = cloneSeed();
  const project = data.projects.find((item) => item.id === data.activeProjectId);
  assert.ok(project);
  const otherProjectId = 'project_other';
  data.activityLogs = [
    {
      id: 'activity_internal',
      projectId: project.id,
      entityType: 'DraftAction',
      entityId: 'draft_1',
      action: 'Created draft actions',
      note: 'Internal capture draft',
      createdAt: localTimestamp('2026-01-15', '12:10'),
    },
    {
      id: 'activity_other_project',
      projectId: otherProjectId,
      entityType: 'Unit',
      entityId: 'unit_other',
      action: 'Updated unit',
      note: 'Other project unit should not show',
      createdAt: localTimestamp('2026-01-15', '12:20'),
    },
    {
      id: 'activity_other_date',
      projectId: project.id,
      entityType: 'Issue',
      entityId: 'issue_other_date',
      action: 'Created issue',
      note: 'Wrong day should not show',
      createdAt: localTimestamp('2026-01-16', '12:20'),
    },
    {
      id: 'activity_unit',
      projectId: project.id,
      entityType: 'Unit',
      entityId: 'unit_204',
      action: 'Updated unit',
      note: 'Unit 204 marked Ready',
      createdAt: localTimestamp('2026-01-15', '12:30'),
    },
    {
      id: 'activity_issue',
      projectId: project.id,
      entityType: 'Issue',
      entityId: 'issue_312',
      action: 'Created issue',
      note: 'Unit 312 sink leak',
      createdAt: localTimestamp('2026-01-15', '13:00'),
    },
  ] satisfies ActivityLog[];

  const snapshot = buildDailyActivitySnapshot(data, project, '2026-01-15');

  assert.equal(snapshot.total, 2);
  assert.equal(snapshot.items.length, 2);
  assert.match(snapshot.items[0], /Updated unit: Unit 204 marked Ready/);
  assert.match(snapshot.items[1], /Created issue: Unit 312 sink leak/);
  assert.equal(snapshot.items.some((item) => item.includes('Internal capture draft')), false);
  assert.equal(snapshot.items.some((item) => item.includes('Other project')), false);
  assert.equal(snapshot.items.some((item) => item.includes('Wrong day')), false);
});

test('buildDailyReport includes activity snapshot without treating current state as selected-day history', () => {
  const data = cloneSeed();
  const project = data.projects.find((item) => item.id === data.activeProjectId);
  assert.ok(project);
  data.activityLogs = [
    {
      id: 'activity_unit',
      projectId: project.id,
      entityType: 'Unit',
      entityId: 'unit_204',
      action: 'Updated unit',
      note: 'Unit 204 marked Ready',
      createdAt: localTimestamp('2026-01-15', '12:30'),
    },
  ] satisfies ActivityLog[];

  const report = buildDailyReport(data, project, '2026-01-15');

  assert.match(report, /Progress \(current board state\):/);
  assert.match(report, /Activity Snapshot \(Jan 15, 2026\):/);
  assert.match(report, /Updated unit: Unit 204 marked Ready/);
  assert.match(report, /Completed Today:\n- No completed summary saved for this date\./);
});
