import type {
  Jul28BlockerKind,
  Jul28HistoryKind,
  Jul28Section,
  Jul28Trade,
  Jul28TurnBoardRepository,
} from '../jul28-turnboard/model';

export const BOARD_FIRST_NAVIGATION = [
  { id: 'turnboard', label: 'TurnBoard' },
  { id: 'activity', label: 'Activity' },
  { id: 'more', label: 'More' },
] as const;

export type BoardFirstView = (typeof BOARD_FIRST_NAVIGATION)[number]['id'];
export const DEFAULT_BOARD_FIRST_VIEW: BoardFirstView = 'turnboard';

export type BoardFirstTone = 'neutral' | 'positive' | 'caution' | 'attention';

export interface BoardFirstSectionProjection {
  section: Jul28Section;
  applicable: boolean;
  label: string;
  tone: BoardFirstTone;
}

export interface BoardFirstTradeProjection {
  trade: Jul28Trade;
  crewLabel: string;
  crewNames: string[];
  summaryLabel: string;
  sections: BoardFirstSectionProjection[];
}

export interface BoardFirstAttentionProjection {
  blockerKind?: Jul28BlockerKind;
  label: string;
  nextAction: string;
  rank: number;
  section: Jul28Section;
  trade: Jul28Trade;
  tone: 'attention' | 'pending';
}

export interface BoardFirstUnitProjection {
  unitId: string;
  unitNumber: string;
  unitTypeLabel: string;
  locationLabel: string;
  applicableSections: Jul28Section[];
  paint: BoardFirstTradeProjection;
  clean: BoardFirstTradeProjection;
  highestAttention: BoardFirstAttentionProjection | null;
  needsMe: boolean;
}

export type BoardFirstActionId =
  | 'review-source'
  | 'review-assignment-conflict'
  | 'clarify-release'
  | 'propose-assignment'
  | 'request-access'
  | 'pass-inspection'
  | 'pass-reinspection'
  | 'create-callback'
  | 'inspection-blocked'
  | 'review-callback'
  | 'review-paper'
  | 'add-note-photo'
  | 'add-blocker';

export interface BoardFirstSectionAction {
  id: BoardFirstActionId;
  label: string;
  description: string;
  opensAssignment?: boolean;
  captureKind?: BoardFirstCaptureKind;
}

export type BoardFirstActivityKind = Jul28HistoryKind | 'note' | 'transcript';

export interface BoardFirstActivityItem {
  id: string;
  kind: BoardFirstActivityKind;
  recordedAt: string;
  sourceLabel: string;
  synthetic: boolean;
  title: string;
  wording: string;
  unitId?: string;
  unitNumber?: string;
  trade?: Jul28Trade;
  section?: Jul28Section;
}

export interface BoardFirstAssignmentConflict {
  existingCrewNames: string[];
  section: Jul28Section;
}

export interface BoardFirstAssignmentProposal {
  crewName: string;
  conflicts: BoardFirstAssignmentConflict[];
  disclaimer: string;
  officialAssignmentCreated: false;
  paperStateChanged: false;
  persisted: false;
  sections: Jul28Section[];
  trade: Jul28Trade;
  unitId: string;
}

export type BoardFirstCaptureKind =
  | 'note'
  | 'photo-file'
  | 'assignment-intake'
  | 'blocker'
  | 'voice';

export interface BoardFirstCaptureRequest {
  kind: BoardFirstCaptureKind;
  origin: 'assistant' | 'plus-sheet' | 'section-sheet';
  section?: Jul28Section;
  trade?: Jul28Trade;
  unitId?: string;
}

export interface BoardFirstActionProposal {
  action: BoardFirstSectionAction;
  disclaimer: string;
  officialStateChanged: false;
  paperStateChanged: false;
  section: Jul28Section;
  trade: Jul28Trade;
  unitId: string;
}

export interface BoardFirstAssistantState {
  draft: string;
  expanded: boolean;
  message: string;
}

export type BoardFirstAssistantAction =
  | { type: 'toggle' }
  | { type: 'expand' }
  | { type: 'collapse' }
  | { type: 'draft-changed'; draft: string }
  | { type: 'message-changed'; message: string };

export interface BoardFirstShellProps {
  activityItems?: readonly BoardFirstActivityItem[];
  dateLabel?: string;
  initialUnitId?: string;
  propertyName?: string;
  repository?: Jul28TurnBoardRepository;
  onActionProposal?: (proposal: BoardFirstActionProposal) => void;
  onAssignmentProposal?: (proposal: BoardFirstAssignmentProposal) => void;
  onAssistantSubmit?: (draft: string) => void;
  onCaptureRequest?: (request: BoardFirstCaptureRequest) => void;
}
