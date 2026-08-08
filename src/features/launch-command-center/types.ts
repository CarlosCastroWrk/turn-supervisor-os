import type { ReactNode } from 'react';

export const LAUNCH_PRIMARY_NAVIGATION = [
  { id: 'home', label: 'Home', kind: 'destination' },
  { id: 'turnboard', label: 'TurnBoard', kind: 'destination' },
  { id: 'plus', label: 'Add', kind: 'action' },
  { id: 'crews', label: 'Crews', kind: 'destination' },
  { id: 'more', label: 'More', kind: 'destination' },
] as const;

export type LaunchNavigationItem = (typeof LAUNCH_PRIMARY_NAVIGATION)[number];
export type LaunchPrimaryDestination = Exclude<LaunchNavigationItem['id'], 'plus'>;

export const LAUNCH_QUICK_ACTIONS = [
  { id: 'import-work', label: 'Paste your memo' },
  { id: 'assign-crews', label: 'Assign crews' },
  { id: 'start-walk', label: 'Start walk' },
  { id: 'end-day', label: 'End day' },
] as const;

export type LaunchQuickActionId = (typeof LAUNCH_QUICK_ACTIONS)[number]['id'];
export type LaunchDailyGoalMetric = 'Units' | 'Sections' | 'Inspections';
export type LaunchDailyGoalMilestone =
  | 'Crew reported complete'
  | 'Los inspected'
  | 'Ready to walk'
  | 'Property accepted';

export interface LaunchDailyGoalViewModel {
  actual: number;
  configured: boolean;
  dateISO: string;
  dateLabel: string;
  metric: LaunchDailyGoalMetric;
  milestone: LaunchDailyGoalMilestone;
  target: number;
}

export interface LaunchHomeCounts {
  blocked: number;
  callbacks: number;
  readyToWalk: number;
  working: number;
}

export interface LaunchBlockerSummary {
  conciseReason: string;
  destinationId: string;
  id: string;
  unitLabel: string;
}

export type LaunchHomeSummaryId = 'working' | 'blocked' | 'callbacks' | 'ready-to-walk';

export interface LaunchHomeProps {
  blockers: readonly LaunchBlockerSummary[];
  counts: LaunchHomeCounts;
  goal: LaunchDailyGoalViewModel;
  onOpenBlocker?: (blocker: LaunchBlockerSummary) => void;
  onOpenSummary?: (summary: LaunchHomeSummaryId) => void;
  onQuickAction?: (action: LaunchQuickActionId) => void;
}

export interface LaunchCommandCenterShellProps {
  activeDestination: LaunchPrimaryDestination;
  backgroundInert?: boolean;
  children: ReactNode;
  contentFocusKey: string;
  contentContained?: boolean;
  contentDialogOpen?: boolean;
  contentTitle: string;
  dateLabel: string;
  intelligenceAvailable?: boolean;
  notificationCount?: number;
  onNavigate: (destination: LaunchPrimaryDestination) => void;
  onOpenIntelligence: () => void;
  onOpenNotifications: () => void;
  onOpenPlus: () => void;
  onOpenSearch: () => void;
  propertyName: string;
}

export type LaunchSearchGroupId =
  | 'units'
  | 'crews'
  | 'notes-activity'
  | 'callbacks'
  | 'blockers';

export interface LaunchSearchResult {
  destinationId: string;
  id: string;
  keywords?: readonly string[];
  meta: string;
  title: string;
}

export interface LaunchSearchGroup {
  id: LaunchSearchGroupId;
  label: string;
  results: readonly LaunchSearchResult[];
}

export interface LaunchSearchPageProps {
  groups: readonly LaunchSearchGroup[];
  onBack: () => void;
  onOpenResult: (result: LaunchSearchResult) => void;
  onQueryChange: (query: string) => void;
  onSelectRecent?: (query: string) => void;
  query: string;
  recentSearches: readonly string[];
}

export const LAUNCH_NOTIFICATION_TABS = [
  { id: 'all', label: 'All' },
  { id: 'inspections', label: 'Inspections' },
  { id: 'callbacks', label: 'Callbacks' },
  { id: 'conflicts', label: 'Conflicts' },
] as const;

export type LaunchNotificationTab = (typeof LAUNCH_NOTIFICATION_TABS)[number]['id'];
export type LaunchNotificationGroupId = 'important' | 'today' | 'earlier';

export interface LaunchNotificationItem {
  category: Exclude<LaunchNotificationTab, 'all'>;
  destinationId: string;
  destinationLabel: string;
  group: LaunchNotificationGroupId;
  id: string;
  read: boolean;
  reason: string;
  timeLabel: string;
  tradeSection?: string;
  unitLabel: string;
}

export interface LaunchNotificationsPageProps {
  activeTab: LaunchNotificationTab;
  items: readonly LaunchNotificationItem[];
  onBack: () => void;
  onOpenNotification: (item: LaunchNotificationItem) => void;
  onTabChange: (tab: LaunchNotificationTab) => void;
}

export interface LaunchLoginSurfaceProps {
  busy?: boolean;
  email: string;
  online: boolean;
  onEmailChange: (email: string) => void;
  onForgotPassword: () => void;
  onPasswordChange: (password: string) => void;
  onSubmit: () => void;
  password: string;
  recovery?: ReactNode;
  sessionMessage?: string;
}
