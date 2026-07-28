export type TrackBTrade = 'Paint' | 'Clean';

export interface PropertyRosterSection {
  id: string;
  label: string;
  trades: readonly TrackBTrade[];
}

export interface PropertyRosterUnit {
  applicableSections: readonly PropertyRosterSection[];
  building?: string;
  floor?: string;
  id: string;
  propertyId: string;
  unitNumber: string;
  unitType: string;
}

export interface PropertyRoster {
  propertyId: string;
  propertyName: string;
  sourceReference?: string;
  units: readonly PropertyRosterUnit[];
}

export type DailyReleaseConfirmationStatus = 'draft' | 'confirmed' | 'rejected';

export interface DailyReleaseEntry {
  restrictions: readonly string[];
  sectionId: string;
  trades: readonly TrackBTrade[];
  uncertainties: readonly string[];
  unitId: string;
}

export interface DailyReleaseBatch {
  confirmedAt?: string;
  confirmedBy?: string;
  confirmationStatus: DailyReleaseConfirmationStatus;
  date: string;
  entries: readonly DailyReleaseEntry[];
  id: string;
  originalSourceReference?: string;
  propertyContact: string;
  propertyId: string;
}

export type DaySessionStatus =
  | 'not-started'
  | 'active'
  | 'ending'
  | 'closed'
  | 'reopened';

export type DayKeyStatus = 'yes' | 'no' | 'partial-issue';

export interface DaySession {
  accountId: string;
  activeCrewIds: readonly string[];
  activeCrewIdsByTrade: Readonly<Record<TrackBTrade, readonly string[]>>;
  closedAt?: string;
  date: string;
  daySessionId: string;
  endKeyStatus?: DayKeyStatus;
  endNote?: string;
  keyStatus: DayKeyStatus;
  morningNote?: string;
  propertyCheckIn?: string;
  propertyContact: string;
  propertyId: string;
  propertyReviewStatus?: 'reviewed' | 'not-reviewed';
  releaseBatchIds: readonly string[];
  reopenedAt?: string;
  startedAt?: string;
  startedBy: string;
  status: DaySessionStatus;
}

export interface StartDayReview {
  accountId: string;
  activeCrewIdsByTrade: Readonly<Record<TrackBTrade, readonly string[]>>;
  crewReviewConfirmed: Readonly<Record<TrackBTrade, boolean>>;
  date: string;
  daySessionId: string;
  explicitConfirmation: boolean;
  keyStatus: DayKeyStatus;
  morningNote?: string;
  propertyContact: string;
  propertyId: string;
  releaseBatchIds: readonly string[];
  startedBy: string;
}

export type DayActorType = 'los' | 'crew' | 'property' | 'system';
export type DaySourceType =
  | 'personal-entry'
  | 'confirmed-release'
  | 'crew-report'
  | 'inspection'
  | 'property-walk'
  | 'day-session';

export interface DaySessionEvent {
  actorId: string;
  actorType: DayActorType;
  daySessionId: string;
  eventId: string;
  eventType: string;
  occurredAt?: string;
  personalOfficialBoundary: 'personal-record-only';
  propertyId: string;
  recordedAt: string;
  recordedBy: string;
  reportedBy?: string;
  reversesEventId?: string;
  sectionId?: string;
  sourceId?: string;
  sourceType: DaySourceType;
  summary: string;
  trade?: TrackBTrade;
  unitId?: string;
}

export type TradeExecutionState =
  | 'unassigned'
  | 'assigned'
  | 'working'
  | 'crew-reported-complete';

export type LosInspectionState =
  | 'pending'
  | 'passed'
  | 'callback-required'
  | 'reinspection-pending'
  | 'passed-after-callback';

export type PropertyWalkState =
  | 'not-ready'
  | 'pending'
  | 'accepted'
  | 'correction-requested';

export interface TodayTaskTradeState {
  assignedCrewId?: string;
  execution: TradeExecutionState;
  inspection: LosInspectionState;
  propertyWalk: PropertyWalkState;
  trade: TrackBTrade;
}

export interface TodayTaskSection {
  building?: string;
  floor?: string;
  releaseBatchId: string;
  restrictions: readonly string[];
  sectionId: string;
  sectionLabel: string;
  tradeStates: readonly TodayTaskTradeState[];
  uncertainties: readonly string[];
  unitId: string;
  unitNumber: string;
  unitType: string;
  waitingReasons: readonly string[];
}

export interface TodayTask {
  date: string;
  daySessionId?: string;
  propertyId: string;
  releaseBatchIds: readonly string[];
  sections: readonly TodayTaskSection[];
}

export type TodayTaskQueueId = 'working' | 'waiting' | 'callbacks' | 'ready-to-walk';

export interface TodayTaskQueue {
  emptyMessage: string;
  id: TodayTaskQueueId;
  label: string;
  records: readonly TodayTaskSection[];
}

export interface TodayTaskProgress {
  actual: number;
  copy: string;
  metric: 'sections';
  milestone: 'los-inspected';
  percentage: number;
  scope: 'today-confirmed-release';
  scopeLabel: string;
  target: number;
}

export interface EndDaySummary {
  assigned: number;
  callbacksOpen: number;
  callbacksResolved: number;
  crewReportedComplete: number;
  inspected: number;
  notesAndPhotos: number;
  propertyAccepted: number;
  readyToWalk: number;
  releasedToday: number;
  unresolvedSectionIds: readonly string[];
  waiting: number;
  working: number;
}

export interface EndDayReview {
  endKeyStatus?: DayKeyStatus;
  endNote?: string;
  explicitConfirmation: boolean;
  propertyCheckIn?: string;
  propertyReviewStatus: 'reviewed' | 'not-reviewed';
}

export type DayRecoveryKind = 'none' | 'restore-active' | 'date-rollover';
export type DayRolloverChoice = 'resume' | 'review-and-close' | 'reopen-as-correction';

export interface DayRecoveryDecision {
  kind: DayRecoveryKind;
  session?: DaySession;
}

export interface TrackBCrewOption {
  activeToday: boolean;
  id: string;
  name: string;
  trade: TrackBTrade;
}
