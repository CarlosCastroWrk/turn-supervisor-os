import type {
  Jul28AssignmentEpisodeKind,
  Jul28Section,
  Jul28Trade,
} from '../model';

export interface Jul28PersonalMutationBoundary {
  readonly recordAuthority: 'personal-turn-os-record-only';
  readonly officialPaperAuthority: 'unchanged';
  readonly officialSystemWriteEffect: 'none';
  readonly propertyApprovalEffect: 'none';
  readonly payrollEffect: 'none';
  readonly automaticMutation: false;
}

export interface Jul28LosConfirmation {
  readonly kind: 'los-explicit-confirmation';
  readonly confirmedAt: string;
}

export interface Jul28PersonalMutationTarget {
  readonly projectId: string;
  readonly unitId: string;
}

export interface Jul28PersonalSectionMutationTarget extends Jul28PersonalMutationTarget {
  readonly trade: Jul28Trade;
  readonly section: Jul28Section;
}

export interface Jul28PersonalMutationBase {
  readonly requestId: string;
  readonly sourceLabel: string;
  readonly sourceText: string;
  readonly recordedAt: string;
  readonly confirmation: Jul28LosConfirmation;
  readonly boundary: Jul28PersonalMutationBoundary;
}

export interface Jul28AssignCrewMutation extends Jul28PersonalMutationBase {
  readonly kind: 'assign-crew';
  readonly target: Jul28PersonalSectionMutationTarget;
  readonly crewMemberId: string;
  readonly episodeKind: Jul28AssignmentEpisodeKind;
}

export interface Jul28CrewReportedCompletionMutation extends Jul28PersonalMutationBase {
  readonly kind: 'record-crew-reported-completion';
  readonly target: Jul28PersonalSectionMutationTarget;
  readonly crewMemberId?: string;
  readonly reportedByLabel: string;
}

export interface Jul28LosInspectionMutation extends Jul28PersonalMutationBase {
  readonly kind: 'record-los-inspection';
  readonly target: Jul28PersonalSectionMutationTarget;
  readonly result: 'passed' | 'callback-required';
  readonly observation: string;
}

export interface Jul28CallbackMutation extends Jul28PersonalMutationBase {
  readonly kind: 'record-callback';
  readonly target: Jul28PersonalSectionMutationTarget;
  readonly state: 'required' | 'correction-reported' | 'reinspection-pending';
  readonly reason: string;
  readonly responsibleCrewMemberId?: string;
}

export interface Jul28PropertyWalkMutation extends Jul28PersonalMutationBase {
  readonly kind: 'record-property-walk';
  readonly target: Jul28PersonalSectionMutationTarget;
  readonly observation:
    | 'walk-pending'
    | 'acceptance-reported'
    | 'rejection-reported'
    | 'walk-completed-without-result';
  readonly accountableSourceLabel: string;
  readonly personalObservationOnly: true;
}

export interface Jul28BlockerMutation extends Jul28PersonalMutationBase {
  readonly kind: 'record-blocker';
  readonly target: Jul28PersonalSectionMutationTarget;
  readonly blockerKind: 'access' | 'maintenance' | 'assignment-conflict' | 'other';
  readonly description: string;
  readonly ownerLabel?: string;
  readonly nextAction?: string;
}

export interface Jul28NoteMutation extends Jul28PersonalMutationBase {
  readonly kind: 'add-note';
  readonly target: Jul28PersonalMutationTarget & {
    readonly trade?: Jul28Trade;
    readonly section?: Jul28Section;
  };
  readonly note: string;
}

export type Jul28PersonalMutation =
  | Jul28AssignCrewMutation
  | Jul28CrewReportedCompletionMutation
  | Jul28LosInspectionMutation
  | Jul28CallbackMutation
  | Jul28PropertyWalkMutation
  | Jul28BlockerMutation
  | Jul28NoteMutation;

export interface Jul28PersonalMutationReceipt {
  readonly requestId: string;
  readonly personalRecordId: string;
  readonly recordedAt: string;
  readonly officialPaperChanged: false;
  readonly officialSystemChanged: false;
  readonly approvalChanged: false;
  readonly payrollChanged: false;
}

/**
 * Future integration port only. Track C provides no implementation, persistence,
 * sync, automatic dispatch, or application wiring.
 */
export interface Jul28PersonalMutationPort {
  recordConfirmedPersonalMutation(
    mutation: Jul28PersonalMutation,
  ): Promise<Jul28PersonalMutationReceipt>;
}
