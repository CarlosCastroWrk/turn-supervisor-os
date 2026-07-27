import type {
  LaunchNotificationItem,
  LaunchNotificationTab,
  LaunchSearchGroup,
} from './types';

const normalized = (value: string) => value.trim().toLocaleLowerCase();

export function calculateDailyGoalProgress(actual: number, target: number): number {
  if (!Number.isFinite(actual) || !Number.isFinite(target) || target <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((actual / target) * 100)));
}

export function filterLaunchSearchGroups(
  groups: readonly LaunchSearchGroup[],
  query: string,
): LaunchSearchGroup[] {
  const needle = normalized(query);
  if (!needle) return groups.map((group) => ({ ...group, results: [...group.results] }));

  return groups
    .map((group) => ({
      ...group,
      results: group.results.filter((result) => normalized([
        result.title,
        result.meta,
        ...(result.keywords ?? []),
      ].join(' ')).includes(needle)),
    }))
    .filter((group) => group.results.length > 0);
}

export function filterLaunchNotifications(
  items: readonly LaunchNotificationItem[],
  tab: LaunchNotificationTab,
): LaunchNotificationItem[] {
  return items.filter((item) => tab === 'all' || item.category === tab);
}
