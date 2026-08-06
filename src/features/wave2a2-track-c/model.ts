export const TRACK_C_TRADES = ['paint', 'clean'] as const;
export const TRACK_C_SECTIONS = ['common', 'A', 'B', 'C', 'D', 'E'] as const;

export type TrackCTrade = (typeof TRACK_C_TRADES)[number];
export type TrackCSection = (typeof TRACK_C_SECTIONS)[number];

export type TrackCReleaseState =
  | 'unreleased'
  | 'released'
  | 'source-uncertain'
  | 'assignment-conflict';

export type TrackCAccessState =
  | 'clear'
  | 'access-blocked'
  | 'occupied-restricted'
  | 'maintenance-blocked';

export type TrackCSourceConfidence = 'confirmed' | 'uncertain' | 'conflicting';

export interface TrackCWorkTarget {
  readonly unitId: string;
  readonly trade: TrackCTrade;
  readonly section: TrackCSection;
}

export interface TrackCWorkFact extends TrackCWorkTarget {
  readonly id: string;
  readonly release: TrackCReleaseState;
  readonly access: TrackCAccessState;
  readonly sourceConfidence: TrackCSourceConfidence;
  readonly sourceLabel: string;
  readonly restrictionLabel?: string;
  readonly workType?: 'full' | 'touch-up' | 'cut-in' | 'full-cut-in' | 'touch-up-cut-in';
  // When this room:trade was confirmed released (the batch's confirmed time).
  // Lets the board show the day/week each unit came onto the wall so Los can
  // rebuild it day by day. Projection-only — not stored.
  readonly releasedAt?: string;
}

export interface TrackCUnit {
  readonly id: string;
  readonly unitNumber: string;
  readonly unitType: string;
  readonly locationLabel: string;
  readonly applicableSections: readonly TrackCSection[];
  readonly workFacts: readonly TrackCWorkFact[];
}

export interface TrackCCrew {
  readonly id: string;
  readonly name: string;
  readonly trade: TrackCTrade;
  readonly phone?: string;
  readonly activeToday: boolean;
}

export type TrackCEventType =
  | 'assignment-confirmed'
  | 'assignment-cleared'
  | 'work-started'
  | 'crew-reported-complete'
  | 'los-passed'
  | 'callback-opened'
  | 'callback-correction-reported'
  | 'callback-resolved'
  | 'property-accepted'
  | 'property-correction-requested'
  | 'walk-not-walked'
  | 'walk-deferred'
  | 'personal-pds-mirror-recorded'
  | 'paper-reviewed';

export type TrackCEventSource =
  | 'synthetic-fixture'
  | 'personal-confirmation'
  | 'crew-report'
  | 'property-walk-observation';

export interface TrackCConfirmedEvent {
  readonly id: string;
  readonly eventType: TrackCEventType;
  readonly confirmation: 'confirmed' | 'draft';
  readonly target: TrackCWorkTarget;
  readonly crewId?: string;
  readonly recordedAt: string;
  readonly recordedBy: string;
  readonly sourceType: TrackCEventSource;
  readonly sourceLabel: string;
  readonly summary: string;
  readonly walkSessionId?: string;
  readonly personalRecordOnly: true;
  readonly officialPaperChanged: false;
  readonly payrollChanged: false;
}

export type TrackCWalkOutcome =
  | 'accepted'
  | 'correction-requested'
  | 'not-walked'
  | 'deferred';

export interface TrackCWalkOutcomeRecord {
  readonly target: TrackCWorkTarget;
  readonly outcome: TrackCWalkOutcome;
  readonly note?: string;
}

export interface TrackCWalkSelectionReview {
  readonly target: TrackCWorkTarget;
  readonly responsibleCrewId: string;
  readonly release: TrackCReleaseState;
  readonly access: TrackCAccessState;
  readonly sourceConfidence: TrackCSourceConfidence;
  readonly assignmentConflict: boolean;
  readonly inspection: TrackCInspectionState;
  readonly property: TrackCPropertyState;
  readonly callbackOpen: boolean;
  readonly confirmedEventCount: number;
}

export interface TrackCWalkSession {
  readonly id: string;
  readonly propertyContact: string;
  readonly startedAt: string;
  readonly startedBy: string;
  readonly selectedTargets: readonly TrackCWorkTarget[];
  readonly reviewedSelections: readonly TrackCWalkSelectionReview[];
  readonly status: 'active' | 'completed';
  readonly endedAt?: string;
  readonly outcomes?: readonly TrackCWalkOutcomeRecord[];
}

export interface TrackCTerminology {
  readonly boardName: string;
  readonly propertyAcceptanceLabel: string;
  readonly personalMirrorLabel: string;
  readonly paperReminder: string;
}

export interface TrackCState {
  readonly propertyId: string;
  readonly propertyName: string;
  readonly units: readonly TrackCUnit[];
  readonly crews: readonly TrackCCrew[];
  readonly events: readonly TrackCConfirmedEvent[];
  readonly activeWalk?: TrackCWalkSession;
  readonly completedWalks: readonly TrackCWalkSession[];
  readonly terminology: TrackCTerminology;
}

export type TrackCExecutionState =
  | 'unassigned'
  | 'assigned'
  | 'working'
  | 'crew-reported-complete';

export type TrackCInspectionState =
  | 'not-ready'
  | 'needs-los-inspection'
  | 'los-passed'
  | 'callback-open'
  | 'reinspection-pending';

export type TrackCPropertyState =
  | 'not-ready'
  | 'pending-property-walk'
  | 'property-accepted';

export interface TrackCWorkProjection extends TrackCWorkFact {
  readonly activeCrewIds: readonly string[];
  readonly responsibleCrewId?: string;
  readonly assignmentConflict: boolean;
  readonly execution: TrackCExecutionState;
  readonly inspection: TrackCInspectionState;
  readonly property: TrackCPropertyState;
  readonly callbackOpen: boolean;
  readonly callbackResolvedCount: number;
  readonly personalPdsMirror: boolean;
  readonly paperReviewed: boolean;
  readonly confirmedEventCount: number;
  readonly latestConfirmedEvent?: TrackCConfirmedEvent;
}

export interface TrackCTradeProgress {
  readonly trade: TrackCTrade;
  readonly applicable: number;
  readonly released: number;
  readonly assigned: number;
  readonly working: number;
  readonly crewReportedComplete: number;
  readonly losPassed: number;
  readonly callbacks: number;
  readonly accepted: number;
  readonly paperMirrored: number;
  readonly crewIds: readonly string[];
  readonly conciseLabel: string;
}

export interface TrackCCompactUnitProjection {
  readonly unitId: string;
  readonly unitNumber: string;
  readonly unitType: string;
  readonly locationLabel: string;
  readonly paint: TrackCTradeProgress;
  readonly clean: TrackCTradeProgress;
  readonly signal: 'needs-me' | 'waiting' | 'none';
  readonly signalCount: number;
  readonly signalLabel: string;
  readonly searchText: string;
}

export interface TrackCCrewStats {
  readonly currentAssignments: number;
  readonly waiting: number;
  readonly crewReportedComplete: number;
  readonly needsLosInspection: number;
  readonly losPassed: number;
  readonly openCallbacks: number;
  readonly resolvedCallbacks: number;
  readonly propertyAccepted: number;
}

export interface TrackCCrewSummary {
  readonly crew: TrackCCrew;
  readonly stats: TrackCCrewStats;
}

export interface TrackCCrewDetail extends TrackCCrewSummary {
  readonly currentWork: readonly TrackCWorkProjection[];
  readonly crewCompleteWork: readonly TrackCWorkProjection[];
  readonly losPassedWork: readonly TrackCWorkProjection[];
  readonly openCallbackWork: readonly TrackCWorkProjection[];
  readonly propertyAcceptedWork: readonly TrackCWorkProjection[];
  readonly recentActivity: readonly TrackCConfirmedEvent[];
}

export type TrackCAssignmentWarningCode =
  | 'unreleased'
  | 'duplicate-active-crew'
  | 'access-conflict'
  | 'occupancy-restriction'
  | 'maintenance-blocked'
  | 'source-uncertain'
  | 'assignment-source-conflict'
  | 'crew-trade-mismatch'
  | 'no-applicable-released-sections';

export interface TrackCAssignmentWarning {
  readonly code: TrackCAssignmentWarningCode;
  readonly severity: 'blocking' | 'caution';
  readonly message: string;
  readonly target?: TrackCWorkTarget;
}

export interface TrackCBulkAssignmentProposalItem {
  readonly target: TrackCWorkTarget;
  readonly eligible: boolean;
  readonly warnings: readonly TrackCAssignmentWarning[];
  readonly reviewedStateFingerprint: string;
}

export interface TrackCBulkAssignmentProposal {
  readonly id: string;
  readonly trade: TrackCTrade;
  readonly crewId: string;
  readonly unitIds: readonly string[];
  readonly sectionMode: 'all-released' | 'specific';
  readonly requestedSections: readonly TrackCSection[];
  readonly createdAt: string;
  readonly createdBy: string;
  readonly items: readonly TrackCBulkAssignmentProposalItem[];
  readonly warnings: readonly TrackCAssignmentWarning[];
  readonly reviewFingerprint: string;
  readonly personalProposalOnly: true;
  readonly officialPaperChanged: false;
  readonly payrollChanged: false;
}

export interface TrackCAssignmentReceipt {
  readonly proposalId: string;
  readonly assignedTargets: readonly TrackCWorkTarget[];
  readonly skippedTargets: readonly TrackCWorkTarget[];
  readonly recordedAt: string;
  readonly officialPaperChanged: false;
  readonly payrollChanged: false;
}

export interface TrackCWalkCandidate {
  readonly target: TrackCWorkTarget;
  readonly targets: readonly TrackCWorkTarget[];
  readonly unitNumber: string;
  readonly unitType: string;
  readonly locationLabel: string;
  readonly crewId: string;
  readonly trade: TrackCTrade;
  readonly sectionCount: number;
}

export interface TrackCOperationError {
  readonly code:
    | 'not-found'
    | 'invalid-transition'
    | 'blocked'
    | 'invalid-proposal'
    | 'active-walk-exists'
    | 'no-active-walk'
    | 'not-walk-candidate'
    | 'incomplete-walk'
    | 'mirror-not-eligible'
    | 'confirmation-required';
  readonly message: string;
}

export type TrackCResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: TrackCOperationError };

export const trackCWorkKey = (target: TrackCWorkTarget) =>
  `${target.unitId}:${target.trade}:${target.section}`;

export const trackCSectionLabel = (section: TrackCSection) =>
  section === 'common' ? 'Common' : section;

export const DEFAULT_TRACK_C_TERMINOLOGY: TrackCTerminology = Object.freeze({
  boardName: 'TurnBoard',
  propertyAcceptanceLabel: 'Property accepted',
  personalMirrorLabel: 'PDS Approved paper mirror',
  paperReminder: 'Update the authoritative paper TurnBoard.',
});

// One place to name a paint work type — English + Spanish (crew texts). 'full'
// returns '' as a "note" so full-paint rooms read plain; the *Full* variant is
// spelled out. Unknown values fall back to full paint.
export type PaintWorkType = 'full' | 'touch-up' | 'cut-in' | 'full-cut-in' | 'touch-up-cut-in';
export const paintWorkTypeLabel = (
  workType: PaintWorkType | undefined,
  lang: 'en' | 'es' = 'en',
): string => {
  if (workType === 'touch-up') return lang === 'es' ? 'retoques' : 'touch-up';
  if (workType === 'cut-in') return lang === 'es' ? 'cortes' : 'cut-in';
  if (workType === 'full-cut-in') return lang === 'es' ? 'completo + cortes' : 'full + cut-in';
  if (workType === 'touch-up-cut-in') return lang === 'es' ? 'retoques + cortes' : 'touch-up + cut-in';
  return lang === 'es' ? 'completa' : 'full paint';
};
// The short "note" that rides next to a room — empty for plain full paint.
export const paintWorkTypeNote = (
  workType: PaintWorkType | undefined,
  lang: 'en' | 'es' = 'en',
): string => (workType && workType !== 'full' ? paintWorkTypeLabel(workType, lang) : '');
