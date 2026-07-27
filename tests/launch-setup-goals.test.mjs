import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateDailyGoalProgress,
  createDefaultDailyGoal,
  validateDailyGoal,
  validateDailyGoalProposal,
} from '../src/features/launch-setup/goals.ts';
import {
  createConservativePermissionSettings,
  resolveDataPhotoCapabilities,
} from '../src/features/launch-setup/personalConfig.ts';
import { resolveLaunchSetupMotionPolicy } from '../src/features/launch-setup/motion.ts';

const achievement = (overrides = {}) => ({
  date: '2026-08-01',
  milestone: 'los-inspected',
  unitId: 'unit-101',
  sectionId: 'A',
  inspectionId: 'inspection-101-a',
  source: 'recorded-operational-fact',
  ...overrides,
});

test('daily goal defaults to Sections plus Los inspected', () => {
  assert.deepEqual(createDefaultDailyGoal('2026-08-01'), {
    date: '2026-08-01',
    metric: 'sections',
    milestone: 'los-inspected',
    target: 1,
  });
});

test('progress deterministically counts unique recorded facts and caps display at 100 percent', () => {
  const goal = { date: '2026-08-01', metric: 'sections', milestone: 'los-inspected', target: 2 };
  const records = [
    achievement(),
    achievement(),
    achievement({ sectionId: 'B', inspectionId: 'inspection-101-b' }),
    achievement({ unitId: 'unit-202', sectionId: 'Common', inspectionId: 'inspection-202-common' }),
    achievement({ date: '2026-08-02', unitId: 'unit-303' }),
    achievement({ milestone: 'crew-reported-complete', unitId: 'unit-404' }),
  ];

  const snapshot = structuredClone(records);
  const progress = calculateDailyGoalProgress(goal, records);
  assert.deepEqual(progress, {
    actual: 3,
    target: 2,
    percentage: 100,
    matchingAchievementCount: 4,
    valid: true,
    validationErrors: [],
  });
  assert.deepEqual(records, snapshot, 'progress calculation must not mutate operational facts');
});

test('each metric uses its own explicit unique key', () => {
  const records = [
    achievement(),
    achievement({ sectionId: 'B', inspectionId: 'inspection-101-b' }),
    achievement({ unitId: 'unit-202', sectionId: undefined, inspectionId: 'inspection-202' }),
  ];
  assert.equal(calculateDailyGoalProgress({ date: '2026-08-01', metric: 'units', milestone: 'los-inspected', target: 5 }, records).actual, 2);
  assert.equal(calculateDailyGoalProgress({ date: '2026-08-01', metric: 'sections', milestone: 'los-inspected', target: 5 }, records).actual, 2);
  assert.equal(calculateDailyGoalProgress({ date: '2026-08-01', metric: 'inspections', milestone: 'los-inspected', target: 5 }, records).actual, 3);
});

test('invalid goals fail closed without calculating progress', () => {
  const goal = { date: '2026-02-30', metric: 'sections', milestone: 'los-inspected', target: 0 };
  const validation = validateDailyGoal(goal);
  assert.equal(validation.valid, false);
  assert.equal(calculateDailyGoalProgress(goal, [achievement()]).actual, 0);
});

test('AI goal proposal is typed and validated but never applied or used for calculation', () => {
  const activeGoal = { date: '2026-08-01', metric: 'sections', milestone: 'los-inspected', target: 20 };
  const proposal = {
    kind: 'daily-goal-proposal',
    id: 'proposal-synthetic-1',
    proposed: { ...activeGoal, target: 30 },
    sourceText: 'Try thirty inspected sections.',
    rationale: 'Synthetic planning example.',
    confidence: 0.7,
    createdAt: '2026-07-27T12:00:00.000Z',
  };
  assert.equal(validateDailyGoalProposal(proposal).valid, true);
  assert.equal(activeGoal.target, 20);
  assert.equal(calculateDailyGoalProgress(activeGoal, [achievement()]).target, 20);
});

test('permission and reduced-motion contracts are conservative and deterministic', () => {
  const settings = createConservativePermissionSettings();
  assert.deepEqual(resolveDataPhotoCapabilities(settings), {
    mayStoreAssignmentSources: false,
    mayStoreWorkPhotos: false,
    maySyncPersonalConfiguration: false,
    protectedDataMayBeStored: false,
  });
  assert.deepEqual(resolveLaunchSetupMotionPolicy(true), {
    animateBrandMark: false,
    questionTransition: 'none',
    transitionDurationMs: 0,
  });
  assert.equal(resolveLaunchSetupMotionPolicy(false).animateBrandMark, true);
});
