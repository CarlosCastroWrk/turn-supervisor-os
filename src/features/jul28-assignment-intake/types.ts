export const ASSIGNMENT_INTAKE_SECTIONS = ['Common', 'A', 'B', 'C', 'D', 'E'] as const;
export const ASSIGNMENT_INTAKE_TRADES = ['Paint', 'Clean'] as const;

export type AssignmentIntakeSection = (typeof ASSIGNMENT_INTAKE_SECTIONS)[number];
export type AssignmentIntakeTrade = (typeof ASSIGNMENT_INTAKE_TRADES)[number];
export type AssignmentIntakeSourceKind = 'paste-text' | 'csv' | 'excel-compatible';
export type AssignmentColumnField = 'unit' | 'section' | 'trade' | 'crew' | 'notes';
export type AssignmentColumnMapping = Partial<Record<AssignmentColumnField, number | null>>;
export type AssignmentEditableField = 'unitInput' | 'sectionInput' | 'tradeInput' | 'crewInput' | 'notesInput';
export type AssignmentRelationshipIssue = 'duplicate-assignment' | 'assignment-conflict';

export interface AssignmentAttachmentMetadata {
  name: string;
  mediaType?: string;
  sizeBytes: number;
  lastModified?: number;
  referenceOnly: true;
  contentsPersisted: false;
}

export interface AssignmentSourceReference {
  id: string;
  kind: AssignmentIntakeSourceKind;
  label: string;
  originalText: string;
  attachment?: AssignmentAttachmentMetadata;
  paperRemainsAuthoritative: true;
}

export type AssignmentConfirmationSourceReference = Omit<AssignmentSourceReference, 'originalText'>;

export type AssignmentIntakeFlagCode =
  | 'missing-unit'
  | 'invalid-unit'
  | 'missing-section'
  | 'unknown-section'
  | 'missing-trade'
  | 'unknown-trade'
  | 'unstructured-row'
  | 'positional-interpretation'
  | 'unparsed-wording'
  | 'formula-like-value'
  | 'invalid-crew'
  | 'invalid-notes'
  | 'duplicate-assignment'
  | 'assignment-conflict';

export interface AssignmentIntakeFlag {
  code: AssignmentIntakeFlagCode;
  severity: 'blocking' | 'warning';
  message: string;
  field?: AssignmentEditableField;
  relatedRecordIds?: string[];
}

export interface AssignmentRecordCorrection {
  field: AssignmentEditableField;
  previousValue: string;
  nextValue: string;
}

export interface ConfirmedAssignmentCorrection {
  field: AssignmentEditableField;
  correctedValue: string;
}

export interface AssignmentRelationshipResolution {
  status: 'supported' | 'excluded';
  supportedRecordId: string;
  relatedRecordIds: string[];
  issue: AssignmentRelationshipIssue;
}

export interface AssignmentIntakeRecord {
  id: string;
  sourceRow: number;
  originalWording: string;
  sourceCells?: string[];
  unitInput: string;
  unitNumber?: string;
  sectionInput: string;
  section?: AssignmentIntakeSection;
  tradeInput: string;
  trade?: AssignmentIntakeTrade;
  crewInput: string;
  crewName?: string;
  notesInput: string;
  notes?: string;
  unparsedWording: string[];
  flags: AssignmentIntakeFlag[];
  corrections: AssignmentRecordCorrection[];
  relationshipResolution?: AssignmentRelationshipResolution;
  reviewState: 'blocked' | 'ready-for-confirmation' | 'excluded';
  confirmationState: 'not-confirmed';
}

export interface AssignmentIntakeDraft {
  kind: 'assignment-intake-draft';
  id: string;
  status: 'draft';
  createdAt: string;
  source: AssignmentSourceReference;
  headers: string[];
  mapping: AssignmentColumnMapping;
  ignoredHeaders: string[];
  delimiter?: string;
  records: AssignmentIntakeRecord[];
  warnings: string[];
  fatalErrors: string[];
  explicitConfirmationRequired: true;
  writesToAppData: false;
}

export interface ConfirmedAssignmentRecord {
  sourceRecordId: string;
  sourceRow: number;
  unitNumber: string;
  section: AssignmentIntakeSection;
  trade: AssignmentIntakeTrade;
  crewName?: string;
  notes?: string;
  corrections: ConfirmedAssignmentCorrection[];
  relationshipResolution?: AssignmentRelationshipResolution;
}

export interface AssignmentIntakeConfirmation {
  kind: 'assignment-intake-confirmation';
  id: string;
  draftId: string;
  source: AssignmentConfirmationSourceReference;
  confirmedAt: string;
  confirmedBy: 'Los';
  scope: 'personal-candidate-only';
  paperRemainsAuthoritative: true;
  writesToAppData: false;
  records: ConfirmedAssignmentRecord[];
}

export type AssignmentIntakeConfirmationResult =
  | { ok: true; confirmation: AssignmentIntakeConfirmation }
  | { ok: false; errors: string[] };

export interface AssignmentImageExtractorRequest {
  source: AssignmentSourceReference;
  image: Blob;
  retention: 'transient-only';
}

export interface AssignmentImageExtractorResult {
  rawText: string;
  confidence?: number;
  warnings: string[];
}

export interface AssignmentImageExtractorProvider {
  readonly id: string;
  readonly displayName: string;
  extract(request: AssignmentImageExtractorRequest): Promise<AssignmentImageExtractorResult>;
}
