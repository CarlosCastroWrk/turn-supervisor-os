import assert from 'node:assert/strict';
import test from 'node:test';
import { seedData } from '../src/data/seed.ts';
import { todayISO } from '../src/lib/constants.ts';
import { getActiveProject } from '../src/lib/metrics.ts';
import { buildTurnPulse } from '../src/lib/turnPulse.ts';
import type { AppData, Issue } from '../src/types.ts';

const cloneSeed = (): AppData => JSON.parse(JSON.stringify(seedData));

const activeProjectFixture = () => {
  const data = cloneSeed();
  const project = getActiveProject(data);
  const now = new Date().toISOString();
  data.units = data.units.map((unit) =>
    unit.projectId === project.id
      ? {
          ...unit,
          overallStatus: 'Ready',
          paintStatus: 'Complete',
          cleanStatus: 'Complete',
          repairStatus: 'Complete',
          flooringStatus: 'Not Applicable',
          trashStatus: 'Complete',
          inspectionStatus: 'Complete',
          updatedAt: now,
        }
      : unit,
  );
  data.issues = data.issues.filter((issue) => issue.projectId !== project.id);
  data.assignments = data.assignments.filter((assignment) => assignment.projectId !== project.id);
  data.dailyLogs = [
    ...data.dailyLogs.filter((log) => log.projectId !== project.id || log.date !== todayISO()),
    {
      id: 'daily_pulse_today',
      projectId: project.id,
      date: todayISO(),
      morningPlan: '',
      middayUpdate: '',
      endOfDayReflection: '',
      completedSummary: '',
      blockers: '',
      lessons: '',
      tomorrowPriorities: '',
      createdAt: now,
      updatedAt: now,
    },
  ];
  return { data, project, now };
};

const issue = (projectId: string, patch: Partial<Issue> = {}): Issue => ({
  id: 'issue_pulse_critical',
  projectId,
  title: 'Water leak in Unit 204',
  category: 'Maintenance',
  priority: 'Critical',
  owner: 'Maintenance',
  status: 'Open',
  dueAt: todayISO(),
  notes: 'Active leak.',
  resolutionNotes: '',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...patch,
});

test('Turn Pulse makes an active-project critical issue the stable first action', () => {
  const { data, project } = activeProjectFixture();
  data.issues.push(issue(project.id));

  const first = buildTurnPulse(data);
  const second = buildTurnPulse(data);

  assert.equal(first.headline, '1 critical issue needs attention now.');
  assert.equal(first.actions[0]?.title, 'Critical issue: Water leak in Unit 204');
  assert.deepEqual(first.actions[0]?.target, { view: 'issues', issueId: 'issue_pulse_critical' });
  assert.equal(first.actions[0]?.id, second.actions[0]?.id);
});

test('Turn Pulse keeps another project critical issue out of the active pulse', () => {
  const { data, project } = activeProjectFixture();
  const otherProjectId = 'project_other_turn';
  data.projects.push({
    ...project,
    id: otherProjectId,
    name: 'Other Test Turn',
    propertyName: 'Other Test Property',
  });
  data.issues.push(issue(otherProjectId, { id: 'issue_other_turn' }));

  const pulse = buildTurnPulse(data);

  assert.match(pulse.headline, /^All \d+ units are marked Ready\.$/);
  assert.equal(pulse.actions.some((action) => action.id.includes('issue_other_turn')), false);
});

test('Turn Pulse makes a blocked unit the next safe navigation without mutating it', () => {
  const { data, project, now } = activeProjectFixture();
  const blockedUnit = data.units.find((unit) => unit.projectId === project.id);
  assert.ok(blockedUnit);
  blockedUnit.overallStatus = 'Access Blocked';
  blockedUnit.updatedAt = now;

  const before = JSON.stringify(data);
  const pulse = buildTurnPulse(data);

  assert.equal(pulse.headline, '1 blocked unit needs an owner or next step.');
  assert.equal(pulse.actions[0]?.title, `Blocked unit: ${blockedUnit.unitNumber}`);
  assert.deepEqual(pulse.actions[0]?.target, { view: 'unitDetail', unitId: blockedUnit.id });
  assert.equal(JSON.stringify(data), before);
});

test('Turn Pulse reports a clear board without inventing work', () => {
  const { data } = activeProjectFixture();
  const pulse = buildTurnPulse(data);

  assert.match(pulse.headline, /^All \d+ units are marked Ready\.$/);
  assert.deepEqual(pulse.actions, []);
  assert.match(pulse.evidence, /0 open issues/);
});

test('Turn Pulse points an empty Turn to setup instead of inventing field work', () => {
  const { data, project } = activeProjectFixture();
  data.units = data.units.filter((unit) => unit.projectId !== project.id);

  const pulse = buildTurnPulse(data);

  assert.equal(pulse.headline, 'Set up this Turn to start a live field pulse.');
  assert.deepEqual(pulse.actions, [{
    id: 'turn_pulse_setup_active_turn',
    title: 'Finish Turn setup',
    reason: 'Add this property’s buildings and units before relying on the field pulse.',
    priority: 'High',
    target: { view: 'setup' },
  }]);
});
