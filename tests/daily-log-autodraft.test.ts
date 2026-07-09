import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import { buildDailyLogAutoDraft } from '../src/lib/dailyLogAutoDraft.ts';
import type { ActivityLog, AppData, DailyLog, Memory, Project } from '../src/types.ts';

const cloneSeed = (): AppData => JSON.parse(JSON.stringify(seedData)) as AppData;
const stamp = '2026-01-15T12:00:00.000Z';
const localTimestamp = (date: string, time: string) => new Date(`${date}T${time}:00`).toISOString();

const emptyLog = (projectId: string, date: string): DailyLog => ({
  id: 'daily_autodraft',
  projectId,
  date,
  morningPlan: '',
  middayUpdate: '',
  endOfDayReflection: '',
  completedSummary: '',
  blockers: '',
  lessons: '',
  tomorrowPriorities: '',
  createdAt: stamp,
  updatedAt: stamp,
});

const lessonMemory = (id: string, projectId: string | undefined, patch: Partial<Memory> = {}): Memory => ({
  id,
  projectId,
  memoryType: 'Lesson Learned',
  content: `Lesson ${id}`,
  source: 'Approved field review',
  confidence: 0.9,
  approved: true,
  createdAt: stamp,
  updatedAt: stamp,
  ...patch,
});

test('buildDailyLogAutoDraft fills empty sections from activity and blockers', () => {
  const data = cloneSeed();
  const project = data.projects.find((item) => item.id === data.activeProjectId);
  assert.ok(project);
  const date = '2026-01-15';
  data.activityLogs = [
    {
      id: 'activity_unit_ready',
      projectId: project.id,
      entityType: 'Unit',
      entityId: 'unit_204',
      action: 'Updated unit',
      note: 'Unit 204 paint done',
      createdAt: localTimestamp(date, '12:30'),
    },
    {
      id: 'activity_other_date',
      projectId: project.id,
      entityType: 'Issue',
      entityId: 'issue_other_date',
      action: 'Created issue',
      note: 'Wrong day',
      createdAt: localTimestamp('2026-01-16', '09:00'),
    },
  ] satisfies ActivityLog[];
  const current = {
    ...emptyLog(project.id, date),
    morningPlan: 'Keep my existing morning plan.',
  };

  const result = buildDailyLogAutoDraft(data, project, date, current);

  assert.equal(result.dailyLog.morningPlan, 'Keep my existing morning plan.');
  assert.equal(result.changedFields.includes('morningPlan'), false);
  assert.match(result.dailyLog.middayUpdate, /Unit 204 paint done/);
  assert.match(result.dailyLog.completedSummary, /Unit 204 paint done/);
  assert.match(result.dailyLog.blockers, /Unit 103/);
  assert.match(result.dailyLog.tomorrowPriorities, /blocked unit/);
  assert.equal(result.dailyLog.endOfDayReflection, '');
  assert.equal(result.dailyLog.lessons, '');
});

test('buildDailyLogAutoDraft leaves fields empty when no grounded source exists', () => {
  const data = cloneSeed();
  const project = data.projects.find((item) => item.id === data.activeProjectId);
  assert.ok(project);
  const date = '2026-01-15';
  data.activityLogs = [];
  data.assignments = [];
  data.issues = [];
  data.units = [];

  const result = buildDailyLogAutoDraft(data, project, date, emptyLog(project.id, date));

  assert.equal(result.dailyLog.middayUpdate, '');
  assert.equal(result.dailyLog.completedSummary, '');
  assert.equal(result.dailyLog.blockers, '');
  assert.equal(result.dailyLog.tomorrowPriorities, '');
  assert.equal(result.changedFields.length, 0);
  assert.equal(result.sourceCount, 0);
  assert.equal(result.changedFields.includes('middayUpdate'), false);
  assert.equal(result.changedFields.includes('completedSummary'), false);
  assert.equal(result.changedFields.includes('blockers'), false);
  assert.equal(result.changedFields.includes('tomorrowPriorities'), false);
});

test('buildDailyLogAutoDraft uses only approved lessons from the selected project', () => {
  const data = cloneSeed();
  const project = data.projects.find((item) => item.id === data.activeProjectId);
  assert.ok(project);
  const otherProject = { ...project, id: 'project_other_lesson', name: 'Other Turn' } satisfies Project;
  data.projects.push(otherProject);
  data.activityLogs = [];
  data.assignments = [];
  data.issues = [];
  data.units = [];
  data.memories = [
    lessonMemory('active_lesson', project.id),
    lessonMemory('other_lesson', otherProject.id),
    lessonMemory('unscoped_lesson', undefined),
    lessonMemory('unapproved_lesson', project.id, { approved: false }),
  ];

  const result = buildDailyLogAutoDraft(data, project, '2026-01-15', emptyLog(project.id, '2026-01-15'));

  assert.match(result.dailyLog.lessons, /Lesson active_lesson/);
  assert.doesNotMatch(result.dailyLog.lessons, /other_lesson|unscoped_lesson|unapproved_lesson/);
  assert.deepEqual(result.usedMemoryIds, ['active_lesson']);
});

test('buildDailyLogAutoDraft does not mark lesson memory used when the section already has text', () => {
  const data = cloneSeed();
  const project = data.projects.find((item) => item.id === data.activeProjectId);
  assert.ok(project);
  data.memories = [lessonMemory('active_lesson', project.id)];
  const current = { ...emptyLog(project.id, '2026-01-15'), lessons: 'Keep Los\'s written lesson.' };

  const result = buildDailyLogAutoDraft(data, project, '2026-01-15', current);

  assert.equal(result.dailyLog.lessons, current.lessons);
  assert.deepEqual(result.usedMemoryIds, []);
});
