export const FIELD_DESTINATIONS = ['today', 'turnboard', 'more'] as const;
export type FieldDestination = (typeof FIELD_DESTINATIONS)[number];

export const FIELD_SECTIONS = ['Common', 'A', 'B', 'C', 'D', 'E'] as const;
export type FieldSection = (typeof FIELD_SECTIONS)[number];

export type FieldTrade = 'Paint' | 'Clean';
export type FieldTaskSlot = 'now' | 'next' | 'backup';

export interface FieldTodayContext {
  propertyName: string;
  dateISO: string;
  dateLabel: string;
}

export type FieldWorkspaceId =
  | 'today'
  | 'turnboard'
  | 'unit-workspace'
  | 'capture-review'
  | 'sync-diagnostics'
  | 'paper-reconciliation';

export interface FieldWorkspaceDestination {
  workspace: FieldWorkspaceId;
  label: string;
}

export interface FieldTask {
  id: string;
  unitNumber: string;
  label: string;
  scope: FieldSection[];
  trade?: FieldTrade;
  warning?: string;
}

export type FieldPersonalPlan = Partial<Record<FieldTaskSlot, FieldTask>>;

export interface FieldWorkItem {
  id: string;
  unitNumber: string;
  scope: FieldSection[];
  trade: FieldTrade;
  detail: string;
  responsibleCrew?: string;
  destination: FieldWorkspaceDestination;
}

export type NeedsMeCategory =
  | 'needs-confirmation'
  | 'needs-my-inspection'
  | 'callbacks'
  | 'property-walks'
  | 'assignment-conflicts'
  | 'access-blockers'
  | 'maintenance-blockers'
  | 'save-or-sync-problems'
  | 'paper-reconciliation';

export interface NeedsMeItem {
  id: string;
  category: NeedsMeCategory;
  unitNumber: string;
  section: FieldSection;
  trade: FieldTrade;
  whyLosIsNeeded: string;
  responsibleParty: string;
  nextAction: string;
  destination: FieldWorkspaceDestination;
}

export interface FieldScheduleItem {
  id: string;
  title: string;
  timeLabel: string;
  unitNumber: string;
  detail: string;
  destination: FieldWorkspaceDestination;
}

export interface FieldRecentActivityItem {
  id: string;
  timeLabel: string;
  unitNumber: string;
  summary: string;
  destination: FieldWorkspaceDestination;
}

export interface MoreDestination {
  id: 'crews' | 'reports' | 'setup' | 'backup' | 'sync';
  label: string;
  detail: string;
}

export interface FieldShellModel {
  context: FieldTodayContext;
  personalPlan: FieldPersonalPlan;
  assignedWork: FieldWorkItem[];
  progressingWork: FieldWorkItem[];
  needsMe: NeedsMeItem[];
  nextPropertyWalk: FieldScheduleItem;
  endOfDayPaperReconciliation: FieldScheduleItem;
  recentActivity: FieldRecentActivityItem[];
  moreDestinations: MoreDestination[];
}
