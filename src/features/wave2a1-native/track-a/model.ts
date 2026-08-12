export const NATIVE_HOME_SUMMARIES = [
  { id: 'needs-crew', label: 'Needs Crew' },
  { id: 'working', label: 'Working' },
  { id: 'needs-inspection', label: 'Needs Inspection' },
  { id: 'waiting', label: 'Waiting / Blocked' },
  { id: 'callbacks', label: 'Callbacks' },
  { id: 'ready-to-walk', label: 'Ready to walk' },
] as const;

export type NativeHomeSummaryId = (typeof NATIVE_HOME_SUMMARIES)[number]['id'];

export interface NativeHomeRecord {
  destinationId: string;
  id: string;
  meta?: string;
  noteLine?: string;
  summaryStates: readonly NativeHomeSummaryId[];
  unitLabel: string;
}

export interface NativeHomeSummaryDestination {
  emptyMessage: string;
  id: NativeHomeSummaryId;
  label: string;
  records: NativeHomeRecord[];
}

export type NativeHomeSummaryCounts = Record<NativeHomeSummaryId, number>;

const HOME_EMPTY_MESSAGES: Record<NativeHomeSummaryId, string> = {
  callbacks: 'No Units have callbacks.',
  'needs-crew': 'Every released Unit has a crew.',
  'needs-inspection': 'Crew-completed work will appear here for your inspection.',
  'ready-to-walk': 'No Units are ready to walk.',
  waiting: 'No Units are waiting.',
  working: 'No Units are working.',
};

export function selectNativeHomeSummary(
  records: readonly NativeHomeRecord[],
  summaryId: NativeHomeSummaryId,
): NativeHomeSummaryDestination {
  const summary = NATIVE_HOME_SUMMARIES.find((item) => item.id === summaryId);
  if (!summary) {
    throw new Error(`Unsupported Home summary: ${summaryId}`);
  }

  return {
    emptyMessage: HOME_EMPTY_MESSAGES[summaryId],
    id: summaryId,
    label: summary.label,
    records: records
      .filter((record) => record.summaryStates.includes(summaryId))
      .map((record) => ({ ...record, summaryStates: [...record.summaryStates] })),
  };
}

export function getNativeHomeSummaryCounts(
  records: readonly NativeHomeRecord[],
): NativeHomeSummaryCounts {
  return Object.fromEntries(
    NATIVE_HOME_SUMMARIES.map(({ id }) => [id, selectNativeHomeSummary(records, id).records.length]),
  ) as NativeHomeSummaryCounts;
}

export const NATIVE_GOAL_METRICS = [
  { id: 'units', label: 'Units' },
  { id: 'sections', label: 'Sections' },
  { id: 'inspections', label: 'Inspections' },
] as const;

export type NativeGoalMetric = (typeof NATIVE_GOAL_METRICS)[number]['id'];

export const NATIVE_GOAL_MILESTONES = [
  { id: 'crew-reported-complete', label: 'Crew reported complete' },
  { id: 'los-inspected', label: 'Los inspected' },
  { id: 'ready-to-walk', label: 'Ready to walk' },
  { id: 'property-accepted', label: 'Property accepted' },
] as const;

export type NativeGoalMilestone = (typeof NATIVE_GOAL_MILESTONES)[number]['id'];

export interface NativeDailyGoal {
  metric: NativeGoalMetric;
  milestone: NativeGoalMilestone;
  target: number;
}

export interface NativeDailyGoalProgress extends NativeDailyGoal {
  actual: number;
  percentage: number;
  progressCopy: string;
}

const GOAL_MILESTONE_COPY: Record<NativeGoalMilestone, string> = {
  'crew-reported-complete': 'crew reported complete',
  'los-inspected': 'inspected',
  'property-accepted': 'property accepted',
  'ready-to-walk': 'ready to walk',
};

export function isValidNativeDailyGoal(goal: NativeDailyGoal): boolean {
  return Number.isInteger(goal.target) && goal.target >= 1 && goal.target <= 10_000;
}

export function getNativeGoalMetricNoun(metric: NativeGoalMetric, count: number): string {
  const singular = metric === 'inspections' ? 'inspection' : metric.slice(0, -1);
  return count === 1 ? singular : metric;
}

export function calculateNativeDailyGoalProgress(
  goal: NativeDailyGoal,
  actual: number,
): NativeDailyGoalProgress {
  const safeActual = Number.isFinite(actual) ? Math.max(0, Math.floor(actual)) : 0;
  const percentage = isValidNativeDailyGoal(goal)
    ? Math.min(100, Math.round((safeActual / goal.target) * 100))
    : 0;
  const noun = getNativeGoalMetricNoun(goal.metric, goal.target);

  return {
    ...goal,
    actual: safeActual,
    percentage,
    progressCopy: `${safeActual} of ${goal.target} ${noun} ${GOAL_MILESTONE_COPY[goal.milestone]}`,
  };
}

export const NATIVE_SEARCH_GROUPS = [
  { id: 'units', label: 'Units' },
  { id: 'crews', label: 'Crews' },
  { id: 'activity', label: 'Activity' },
] as const;

export type NativeSearchGroupId = (typeof NATIVE_SEARCH_GROUPS)[number]['id'];

export interface NativeSearchResult {
  destinationId: string;
  id: string;
  keywords?: readonly string[];
  meta?: string;
  title: string;
}

export interface NativeSearchGroup {
  id: NativeSearchGroupId;
  results: readonly NativeSearchResult[];
}

const normalizeSearchValue = (value: string) => value.trim().toLocaleLowerCase();

export function filterNativeSearchGroups(
  groups: readonly NativeSearchGroup[],
  query: string,
): NativeSearchGroup[] {
  const needle = normalizeSearchValue(query);
  if (!needle) {
    return groups.map((group) => ({
      ...group,
      results: group.results.map((result) => ({ ...result, keywords: [...(result.keywords ?? [])] })),
    }));
  }

  return groups
    .map((group) => ({
      ...group,
      results: group.results
        .filter((result) => normalizeSearchValue([
          result.title,
          result.meta ?? '',
          ...(result.keywords ?? []),
        ].join(' ')).includes(needle))
        .map((result) => ({ ...result, keywords: [...(result.keywords ?? [])] })),
    }))
    .filter((group) => group.results.length > 0);
}

export const NATIVE_NOTIFICATION_TABS = [
  { id: 'all', label: 'All' },
  { id: 'inspections', label: 'Inspections' },
  { id: 'callbacks', label: 'Callbacks' },
  { id: 'conflicts', label: 'Conflicts' },
] as const;

export type NativeNotificationTab = (typeof NATIVE_NOTIFICATION_TABS)[number]['id'];
export type NativeNotificationCategory = Exclude<NativeNotificationTab, 'all'>;

export const NATIVE_NOTIFICATION_GROUPS = [
  { id: 'important', label: 'Important' },
  { id: 'today', label: 'Today' },
  { id: 'earlier', label: 'Earlier' },
] as const;

export type NativeNotificationGroupId = (typeof NATIVE_NOTIFICATION_GROUPS)[number]['id'];

export interface NativeNotificationItem {
  category: NativeNotificationCategory;
  destinationId: string;
  destinationLabel: string;
  group: NativeNotificationGroupId;
  id: string;
  read: boolean;
  reason: string;
  timeLabel: string;
  title: string;
}

export interface NativeNotificationSection {
  id: NativeNotificationGroupId;
  items: NativeNotificationItem[];
  label: string;
}

export function groupNativeNotifications(
  items: readonly NativeNotificationItem[],
  tab: NativeNotificationTab,
): NativeNotificationSection[] {
  const filtered = tab === 'all' ? items : items.filter((item) => item.category === tab);

  return NATIVE_NOTIFICATION_GROUPS.map((group) => ({
    ...group,
    items: filtered
      .filter((item) => item.group === group.id)
      .map((item) => ({ ...item })),
  })).filter((group) => group.items.length > 0);
}

export const NATIVE_PAGE_TRANSITION_DURATION_MS = 210;

export interface NativePageTransitionPolicy {
  durationMs: number;
  easing: string;
  translatePx: number;
}

export function resolveNativePageTransitionPolicy(
  reducedMotion: boolean,
): NativePageTransitionPolicy {
  return reducedMotion
    ? { durationMs: 0, easing: 'linear', translatePx: 0 }
    : {
        durationMs: NATIVE_PAGE_TRANSITION_DURATION_MS,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        translatePx: 8,
      };
}
