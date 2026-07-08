import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import { buildDailyReport } from '../src/lib/exporters.ts';
import { formatDate, todayISO } from '../src/lib/constants.ts';
import type { AppData, DailyLog } from '../src/types.ts';

const cloneSeed = (): AppData => JSON.parse(JSON.stringify(seedData)) as AppData;

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
