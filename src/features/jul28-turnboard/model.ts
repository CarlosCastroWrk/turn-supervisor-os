export const JUL28_TRADES = ['paint', 'clean'] as const;
export type Jul28Trade = (typeof JUL28_TRADES)[number];

export const JUL28_SECTIONS = ['common', 'A', 'B', 'C', 'D', 'E'] as const;
export type Jul28Section = (typeof JUL28_SECTIONS)[number];

export type Jul28Applicability = 'applicable' | 'not-applicable';

export type Jul28AuthorizationState =
  | 'not-released'
  | 'released'
  | 'uncertain'
  | 'assignment-conflict';

export type Jul28AccessState =
  | 'accessible'
  | 'occupied-or-restricted'
  | 'access-blocked'
  | 'maintenance-blocked';

export type Jul28CrewExecutionState =
  | 'unassigned'
  | 'assigned'
  | 'working'
  | 'crew-reported-complete'
  | 'cancelled';

export type Jul28InspectionState =
  | 'inspection-pending'
  | 'los-passed'
  | 'callback-required'
  | 'reinspection-pending'
  | 'passed-after-callback';

export type Jul28PropertyWalkState =
  | 'walk-not-recorded'
  | 'walk-not-ready'
  | 'walk-pending';

export type Jul28PaperReviewState = 'needs-paper-review' | 'paper-reviewed';

export type Jul28AssignmentEpisodeKind =
  | 'initial'
  | 'added-scope'
  | 'reassignment'
  | 'callback'
  | 'cancellation'
  | 'supersession';

export interface Jul28AssignmentEpisode {
  id: string;
  kind: Jul28AssignmentEpisodeKind;
  crewName: string;
  sourceLabel: string;
  recordedAt: string;
  active: boolean;
  wording: string;
}

export type Jul28HistoryKind =
  | 'assignment'
  | 'access'
  | 'crew-report'
  | 'los-inspection'
  | 'property-walk'
  | 'paper-review';

export interface Jul28HistoryEvent {
  id: string;
  kind: Jul28HistoryKind;
  recordedAt: string;
  title: string;
  wording: string;
  sourceLabel: string;
}

export interface Jul28SectionTradeRecord {
  id: string;
  unitId: string;
  trade: Jul28Trade;
  section: Jul28Section;
  applicability: Jul28Applicability;
  authorization: Jul28AuthorizationState;
  access: Jul28AccessState;
  assignmentEpisodes: Jul28AssignmentEpisode[];
  crewExecution: Jul28CrewExecutionState;
  inspection: Jul28InspectionState;
  propertyWalk: Jul28PropertyWalkState;
  paperReview: Jul28PaperReviewState;
  fullPaint: boolean;
  restrictionLabel?: string;
  updatedAt: string;
  history: Jul28HistoryEvent[];
}

export interface Jul28UnitRecord {
  id: string;
  unitNumber: string;
  buildingLabel: string;
  floorLabel: string;
  sectionOrder: Jul28Section[];
  records: Jul28SectionTradeRecord[];
}

export interface Jul28TurnBoardRepository {
  readonly source: 'synthetic-jul28-pattern-candidate';
  listUnits(): readonly Jul28UnitRecord[];
  getUnit(unitId: string): Jul28UnitRecord | undefined;
}

export type Jul28LayerTone = 'recorded' | 'pending' | 'attention' | 'partial' | 'not-applicable';

export interface Jul28LayerProjection {
  label: string;
  detail: string;
  tone: Jul28LayerTone;
  recordedAt?: string;
}

export interface Jul28UnitLayerProjection {
  assignmentEvidence: Jul28LayerProjection;
  crewReported: Jul28LayerProjection;
  losInspection: Jul28LayerProjection;
  propertyWalk: Jul28LayerProjection;
  paperReview: Jul28LayerProjection;
}

export type Jul28AttentionKind =
  | 'assignment-conflict'
  | 'duplicate-assignment'
  | 'inspection-blocked'
  | 'callback-required'
  | 'ready-for-my-walk'
  | 'added-scope'
  | 'in-progress'
  | 'awaiting-crew'
  | 'paper-review';

export interface Jul28UnitCardProjection {
  unitId: string;
  unitNumber: string;
  locationLabel: string;
  trade: Jul28Trade;
  applicableSections: Jul28Section[];
  notApplicableSections: Jul28Section[];
  restrictedSections: Jul28Section[];
  fullPaintSections: Jul28Section[];
  crewNames: string[];
  duplicateAssignmentSections: Jul28Section[];
  addedScopeSections: Jul28Section[];
  attentionKind: Jul28AttentionKind;
  attentionLabel: string;
  layers: Jul28UnitLayerProjection;
  updatedAt: string;
}

export type Jul28TurnBoardFilter = 'all' | 'needs-me' | 'crew-reported' | 'my-walk';
