export const ASSIGNMENT_SECTIONS = ['Common', 'A', 'B', 'C', 'D', 'E'] as const;
export const ASSIGNMENT_TRADES = ['Paint', 'Clean'] as const;

export type AssignmentSection = (typeof ASSIGNMENT_SECTIONS)[number];
export type AssignmentTrade = (typeof ASSIGNMENT_TRADES)[number];
export type AssignmentIntakeEntryPoint =
  | 'take-photo'
  | 'choose-image'
  | 'choose-file'
  | 'paste-text'
  | 'enter-manually';

export interface AssignmentSourceMetadata {
  id: string;
  entryPoint: AssignmentIntakeEntryPoint;
  label: string;
  mediaType: string;
  sizeBytes: number;
  capturedAt: string;
  untrusted: true;
  retention: 'transient-local-review-only';
}

export type AssignmentSourceOriginal =
  | {
      kind: 'text';
      text: string;
    }
  | {
      kind: 'binary';
      bytes: Uint8Array;
    };

export interface AssignmentSourceArtifact extends AssignmentSourceMetadata {
  original: AssignmentSourceOriginal;
}

export interface RejectedAssignmentSource {
  source: AssignmentSourceMetadata;
  reasonCodes: SensitiveMaterialCode[];
  messages: string[];
  originalRetained: false;
  extractorInvoked: boolean;
  discardRequired: true;
}

export type SensitiveMaterialCode =
  | 'signature'
  | 'w9-or-tax-form'
  | 'paycard-or-payroll'
  | 'access-credential'
  | 'tenant-sensitive'
  | 'provider-detected-sensitive-material';

export type AssignmentAccessSignal =
  | 'occupied-claim'
  | 'renewal-claim'
  | 'do-not-enter-claim'
  | 'access-blocked-claim';

export interface ExtractedTradeMention {
  trade: string;
  sections: string[];
  scopeText: string;
}

export interface AssignmentExtractionCandidate {
  unit: string;
  unitType?: string;
  sectionMentions: string[];
  tradeMentions: ExtractedTradeMention[];
  originalExcerpt: string;
  confidence: number;
  uncertainties: string[];
  accessSignals: AssignmentAccessSignal[];
  suggestedInterpretation: string;
  sensitiveMaterialDetected: SensitiveMaterialCode[];
}

export interface ManualAssignmentFields {
  unit: string;
  unitType?: string;
  sections: string[];
  paintScope?: string;
  cleanScope?: string;
  otherTradeMentions?: string[];
  uncertainties?: string[];
  accessSignals?: AssignmentAccessSignal[];
  suggestedInterpretation?: string;
}

export interface AssignmentExtractorRequest {
  source: AssignmentSourceArtifact;
  manualFields?: ManualAssignmentFields;
  trust: 'untrusted-source';
  task: 'extract-assignment-draft-only';
  permissions: {
    mayAuthorizeWork: false;
    mayWriteOperationalState: false;
    maySubmitForms: false;
  };
}

export interface AssignmentExtractorProvider {
  readonly id: string;
  readonly displayName: string;
  extract(request: AssignmentExtractorRequest): Promise<unknown>;
}

export interface KnownUnitForAssignmentIntake {
  unit: string;
  unitType?: string;
  sections: AssignmentSection[];
}

export interface AssignmentValidationContext {
  knownUnits: KnownUnitForAssignmentIntake[];
  existingDraftUnits?: string[];
  allowedTrades?: AssignmentTrade[];
}

export type AssignmentConflictCode =
  | 'missing-unit'
  | 'unknown-unit'
  | 'unit-type-mismatch'
  | 'missing-section'
  | 'unknown-section'
  | 'unknown-trade'
  | 'source-excerpt-mismatch';

export interface AssignmentValidationConflict {
  id: string;
  code: AssignmentConflictCode;
  message: string;
  severity: 'blocking';
  value?: string;
}

export type AssignmentSourceWarningCode =
  | 'prompt-injection-language'
  | 'unverified-authority-claim'
  | 'binary-source-manually-transcribed';

export interface AssignmentSourceWarning {
  id: string;
  code: AssignmentSourceWarningCode;
  message: string;
  acknowledgementRequired: true;
}

export interface AssignmentOccupancyAccessConflict {
  id: string;
  signal: AssignmentAccessSignal;
  message: string;
  acknowledgementRequired: true;
}

export interface AssignmentTradeScopeDraft {
  state: 'included' | 'not-mentioned' | 'uncertain';
  sections: AssignmentSection[];
  description: string;
}

export interface AssignmentIntakeDraft {
  id: string;
  sourceId: string;
  unit: string;
  unitType?: string;
  sections: AssignmentSection[];
  paintScope: AssignmentTradeScopeDraft;
  cleanScope: AssignmentTradeScopeDraft;
  originalExcerpt: string;
  confidence: number;
  uncertainties: string[];
  duplicateWarnings: string[];
  occupancyAccessConflicts: AssignmentOccupancyAccessConflict[];
  sourceWarnings: AssignmentSourceWarning[];
  validationConflicts: AssignmentValidationConflict[];
  suggestedInterpretation: string;
  authority: 'none';
  writesOperationalState: false;
  explicitConfirmationRequired: true;
}

export interface AssignmentIntakeReviewSession {
  kind: 'assignment-intake-review';
  source: AssignmentSourceArtifact;
  extractor: {
    providerId: string;
    providerName: string;
  };
  draft: AssignmentIntakeDraft;
  paperRemainsAuthoritative: true;
}

export interface InvalidAssignmentExtraction {
  kind: 'invalid-extraction';
  source: AssignmentSourceArtifact;
  extractor: {
    providerId: string;
    providerName: string;
  };
  schemaIssues: string[];
  writesOperationalState: false;
}

export type AssignmentIntakeReviewResult =
  | {
      status: 'review';
      session: AssignmentIntakeReviewSession;
    }
  | {
      status: 'rejected';
      rejection: RejectedAssignmentSource;
    }
  | {
      status: 'invalid-extraction';
      invalid: InvalidAssignmentExtraction;
    };

export interface AssignmentConfirmationRequest {
  confirmedByLos: boolean;
  confirmedAt?: string;
  acknowledgeSourceWarningIds?: string[];
  acknowledgeDuplicateWarnings?: boolean;
  acknowledgeOccupancyConflictIds?: string[];
  acknowledgeUncertainties?: boolean;
}

export interface AssignmentPersonalRecordProposal {
  kind: 'assignment-personal-record-proposal';
  id: string;
  draftId: string;
  sourceId: string;
  confirmedAt: string;
  confirmedBy: 'Los';
  unit: string;
  unitType?: string;
  sections: AssignmentSection[];
  paintScope: AssignmentTradeScopeDraft;
  cleanScope: AssignmentTradeScopeDraft;
  originalExcerpt: string;
  confidence: number;
  uncertainties: string[];
  duplicateWarnings: string[];
  occupancyAccessConflicts: AssignmentOccupancyAccessConflict[];
  suggestedInterpretation: string;
  scope: 'personal-record-proposal-only';
  authority: 'none';
  paperRemainsAuthoritative: true;
  requiresDeterministicApplication: true;
  writesOperationalState: false;
}

export type AssignmentConfirmationResult =
  | {
      ok: true;
      proposal: AssignmentPersonalRecordProposal;
    }
  | {
      ok: false;
      errors: string[];
    };
