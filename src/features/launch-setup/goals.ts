export const DAILY_GOAL_METRICS = ['units', 'sections', 'inspections'] as const;
export type DailyGoalMetric = (typeof DAILY_GOAL_METRICS)[number];

export const DAILY_GOAL_MILESTONES = [
  'crew-reported-complete',
  'los-inspected',
  'ready-to-walk',
  'property-accepted',
] as const;
export type DailyGoalMilestone = (typeof DAILY_GOAL_MILESTONES)[number];

export interface DailyGoalConfiguration {
  date: string;
  metric: DailyGoalMetric;
  milestone: DailyGoalMilestone;
  target: number;
}

export interface DailyGoalAchievement {
  date: string;
  milestone: DailyGoalMilestone;
  unitId: string;
  sectionId?: string;
  inspectionId?: string;
  source: 'recorded-operational-fact';
}

export interface DailyGoalValidation {
  valid: boolean;
  errors: string[];
}

export interface DailyGoalProgress {
  actual: number;
  target: number;
  percentage: number;
  matchingAchievementCount: number;
  valid: boolean;
  validationErrors: string[];
}

export interface DailyGoalProposal {
  kind: 'daily-goal-proposal';
  id: string;
  proposed: DailyGoalConfiguration;
  sourceText: string;
  rationale: string;
  confidence: number;
  createdAt: string;
}

const MAX_DAILY_GOAL_TARGET = 10_000;

const isIsoDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const isMetric = (value: unknown): value is DailyGoalMetric =>
  typeof value === 'string' && DAILY_GOAL_METRICS.includes(value as DailyGoalMetric);

const isMilestone = (value: unknown): value is DailyGoalMilestone =>
  typeof value === 'string' && DAILY_GOAL_MILESTONES.includes(value as DailyGoalMilestone);

export const createDefaultDailyGoal = (date: string): DailyGoalConfiguration => ({
  date,
  metric: 'sections',
  milestone: 'los-inspected',
  target: 1,
});

export const validateDailyGoal = (goal: DailyGoalConfiguration): DailyGoalValidation => {
  const errors: string[] = [];
  if (!isIsoDate(goal.date)) errors.push('Date must be a real YYYY-MM-DD field date.');
  if (!isMetric(goal.metric)) errors.push('Metric must be Units, Sections, or Inspections.');
  if (!isMilestone(goal.milestone)) errors.push('Milestone is not supported.');
  if (!Number.isInteger(goal.target) || goal.target < 1 || goal.target > MAX_DAILY_GOAL_TARGET) {
    errors.push(`Target must be a whole number from 1 to ${MAX_DAILY_GOAL_TARGET}.`);
  }
  return { valid: errors.length === 0, errors };
};

const achievementKey = (metric: DailyGoalMetric, achievement: DailyGoalAchievement) => {
  const unitId = achievement.unitId.trim();
  if (!unitId) return null;

  if (metric === 'units') return `unit:${unitId}`;

  if (metric === 'sections') {
    const sectionId = achievement.sectionId?.trim();
    return sectionId ? `section:${unitId}:${sectionId}` : null;
  }

  const inspectionId = achievement.inspectionId?.trim();
  return inspectionId ? `inspection:${unitId}:${inspectionId}` : null;
};

export const calculateDailyGoalProgress = (
  goal: DailyGoalConfiguration,
  achievements: readonly DailyGoalAchievement[],
): DailyGoalProgress => {
  const validation = validateDailyGoal(goal);
  if (!validation.valid) {
    return {
      actual: 0,
      target: goal.target,
      percentage: 0,
      matchingAchievementCount: 0,
      valid: false,
      validationErrors: validation.errors,
    };
  }

  const uniqueEntities = new Set<string>();
  let matchingAchievementCount = 0;

  for (const achievement of achievements) {
    if (achievement.source !== 'recorded-operational-fact') continue;
    if (achievement.date !== goal.date || achievement.milestone !== goal.milestone) continue;
    matchingAchievementCount += 1;
    const key = achievementKey(goal.metric, achievement);
    if (key) uniqueEntities.add(key);
  }

  const actual = uniqueEntities.size;
  return {
    actual,
    target: goal.target,
    percentage: Math.min(100, Math.round((actual / goal.target) * 100)),
    matchingAchievementCount,
    valid: true,
    validationErrors: [],
  };
};

export const validateDailyGoalProposal = (proposal: DailyGoalProposal): DailyGoalValidation => {
  const errors = [...validateDailyGoal(proposal.proposed).errors];
  if (proposal.kind !== 'daily-goal-proposal') errors.push('Proposal kind is invalid.');
  if (!proposal.id.trim()) errors.push('Proposal ID is required.');
  if (!proposal.sourceText.trim()) errors.push('The proposal must preserve its source wording.');
  if (!proposal.rationale.trim()) errors.push('Proposal rationale is required.');
  if (Number.isNaN(Date.parse(proposal.createdAt))) errors.push('Proposal creation time is invalid.');
  if (!Number.isFinite(proposal.confidence) || proposal.confidence < 0 || proposal.confidence > 1) {
    errors.push('Proposal confidence must be between 0 and 1.');
  }
  return { valid: errors.length === 0, errors };
};
