export const TURN_CONTEXT_SNAPSHOT_VERSION = 'jul28-intelligence-v1' as const;

export const TURN_SECTIONS = ['Common', 'A', 'B', 'C', 'D', 'E'] as const;
export type TurnSection = (typeof TURN_SECTIONS)[number];

export const TURN_TRADES = ['Paint', 'Clean'] as const;
export type TurnTrade = (typeof TURN_TRADES)[number];

export type AuthorizationState = 'not-released' | 'released' | 'uncertain' | 'assignment-conflict';
export type AccessState =
  | 'accessible'
  | 'occupied-or-restricted'
  | 'access-blocked'
  | 'maintenance-blocked';
export type CrewExecutionState =
  | 'unassigned'
  | 'assigned'
  | 'working'
  | 'crew-reported-complete'
  | 'cancelled';
export type LosInspectionState =
  | 'inspection-pending'
  | 'los-passed'
  | 'callback-required'
  | 'reinspection-pending'
  | 'passed-after-callback';
export type PropertyWalkState = 'walk-not-ready' | 'walk-pending' | 'property-accepted' | 'property-rejected';
export type PaperReconciliationState = 'needs-paper-review' | 'paper-reviewed';

export interface PropertyScope {
  id: string;
  label: string;
  /** Safe identifier for metrics and exports that should not disclose a property name. */
  redactedRef: string;
  dataClass: 'synthetic' | 'personal-redacted';
}

export interface TradeScopeSnapshot {
  scopeId: string;
  unitRef: string;
  section: TurnSection;
  trade: TurnTrade;
  authorization: AuthorizationState;
  access: AccessState;
  crewExecution: CrewExecutionState;
  losInspection: LosInspectionState;
  propertyWalk: PropertyWalkState;
  paperReconciliation: PaperReconciliationState;
  activeCrewClaimCount: number;
  assignmentEpisodeRefs: string[];
  lastChangedAt: string;
}

export interface TurnUnitSnapshot {
  unitRef: string;
  applicableSections: TurnSection[];
  scopes: TradeScopeSnapshot[];
}

export type MemorySourceKind =
  | 'synthetic-fixture'
  | 'los-observation'
  | 'corporate-training'
  | 'property-instruction'
  | 'official-document';

export interface MemoryEvidenceSource {
  kind: MemorySourceKind;
  label: string;
  sourceDate: string;
  reference?: string;
}

export type MemoryApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface ApprovedMemoryCandidate {
  id: string;
  propertyScope: PropertyScope;
  statement: string;
  source: MemoryEvidenceSource;
  confidence: number;
  approvalStatus: MemoryApprovalStatus;
  capturedAt: string;
  reviewedAt?: string;
  reviewedBy?: 'Los';
}

export type ActivityAuthorityLayer =
  | 'authorization'
  | 'access'
  | 'crew-execution'
  | 'los-inspection'
  | 'property-walk'
  | 'paper-reconciliation';

export type TurnActivityEventType =
  | 'assignment-released'
  | 'assignment-scope-added'
  | 'assignment-conflict-recorded'
  | 'access-restriction-recorded'
  | 'access-restored'
  | 'crew-assigned'
  | 'crew-work-started'
  | 'crew-reported-complete'
  | 'los-inspection-passed'
  | 'callback-required'
  | 'reinspection-pending'
  | 'passed-after-callback'
  | 'property-walk-pending'
  | 'property-accepted'
  | 'property-rejected'
  | 'paper-review-needed'
  | 'paper-reviewed';

export interface TurnActivityEvent {
  id: string;
  propertyScopeRef: string;
  eventType: TurnActivityEventType;
  unitRef: string;
  section?: TurnSection;
  trade?: TurnTrade;
  occurredAt: string;
  source: 'synthetic-fixture' | 'los-manual-record';
}

export interface TurnContextSnapshot {
  version: typeof TURN_CONTEXT_SNAPSHOT_VERSION;
  snapshotId: string;
  propertyScope: PropertyScope;
  asOf: string;
  paperAuthority: 'official-paper-turnboard';
  payrollAvailability: 'unavailable-not-inferred';
  units: TurnUnitSnapshot[];
  activityEvents: TurnActivityEvent[];
  memoryCandidates: ApprovedMemoryCandidate[];
}

export type CaptureMethod = 'typed' | 'browser-speech' | 'keyboard-dictation' | 'attachment' | 'manual';
export type ProposalOutcome = 'confirmed' | 'edited-and-confirmed' | 'rejected' | 'ambiguous';

interface UsageLedgerEventBase {
  id: string;
  propertyScopeRef: string;
  captureId: string;
  occurredAt: string;
}

export interface CaptureStartedEvent extends UsageLedgerEventBase {
  eventType: 'capture-started';
  method: CaptureMethod;
}

export interface SourcePreservedEvent extends UsageLedgerEventBase {
  eventType: 'source-preserved';
  method: CaptureMethod;
}

export interface ProposalCreatedEvent extends UsageLedgerEventBase {
  eventType: 'proposal-created';
  proposalId: string;
}

export interface ProposalResolvedEvent extends UsageLedgerEventBase {
  eventType: 'proposal-resolved';
  proposalId: string;
  outcome: ProposalOutcome;
}

/** Deliberately excludes transcripts, notes, names, phone numbers, and file contents. */
export type UsageLedgerEvent =
  | CaptureStartedEvent
  | SourcePreservedEvent
  | ProposalCreatedEvent
  | ProposalResolvedEvent;

export interface UsageLedger {
  entries: UsageLedgerEvent[];
}

export interface ModelApiUsageInput {
  providerRef: string;
  modelRef: string;
  inputUnits: number;
  cachedInputUnits: number;
  outputUnits: number;
}

export interface ModelApiCostResult {
  status: 'available' | 'unavailable';
  totalCostUsd?: number;
  pricingVersion?: string;
  reason?: string;
}

/** Integration interface only. Track E does not supply pricing or call a provider. */
export interface ModelApiCostAdapter {
  estimate(input: ModelApiUsageInput): ModelApiCostResult;
}

export interface ModelApiCostReceipt extends ModelApiUsageInput {
  id: string;
  propertyScopeRef: string;
  occurredAt: string;
  costSource: 'provider-reported' | 'configured-estimate';
  totalCostUsd?: number;
  pricingVersion?: string;
}

export interface GroundedFact {
  layer: ActivityAuthorityLayer;
  value: string;
}

export interface GroundedAnswerRecord {
  recordKind: 'current-scope' | 'activity-event';
  unitRef: string;
  section?: TurnSection;
  trade?: TurnTrade;
  occurredAt?: string;
  facts: GroundedFact[];
}

export type SupportedTurnQuestionKind =
  | 'needs-inspection'
  | 'callbacks'
  | 'ready-for-property-walk'
  | 'unit-history'
  | 'needs-paper-reconciliation';

export interface AnsweredTurnQuestion {
  status: 'answered';
  questionKind: SupportedTurnQuestionKind;
  asOf: string;
  propertyScopeRef: string;
  summary: string;
  records: GroundedAnswerRecord[];
}

export interface UnansweredTurnQuestion {
  status: 'not-answered';
  reason: 'unsupported-question' | 'insufficient-evidence' | 'payroll-unavailable';
  message: string;
}

export type TurnQuestionResult = AnsweredTurnQuestion | UnansweredTurnQuestion;
