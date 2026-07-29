import type {
  TrackCSection,
  TrackCTrade,
} from '../wave2a2-track-c/model';

export type TrackBAdditionalScopeType =
  | 'full-paint'
  | 'doors'
  | 'drywall-repair'
  | 'bathtub-clean'
  | 'other';

export type TrackBChangeOrderCandidate = 'yes' | 'no' | 'uncertain';

export type TrackBAdditionalScopeStatus =
  | 'draft'
  | 'needs-clarification'
  | 'ready-for-review';

export interface TrackBAdditionalScopeDraft {
  readonly id: string;
  readonly unitId: string;
  readonly scopeType: TrackBAdditionalScopeType;
  readonly relatedTrade?: TrackCTrade;
  readonly sections: readonly TrackCSection[];
  readonly description: string;
  readonly sourceContact: string;
  readonly sourceRecordedAt: string;
  readonly changeOrderCandidate: TrackBChangeOrderCandidate;
  readonly status: TrackBAdditionalScopeStatus;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly personalDraftOnly: true;
  readonly blocksStandardWork: false;
  readonly officialChangeOrderCreated: false;
  readonly officialFormSubmitted: false;
  readonly persistenceOwner: 'integration';
}

export interface TrackBAdditionalScopeDraftInput {
  readonly id: string;
  readonly unitId: string;
  readonly scopeType: TrackBAdditionalScopeType;
  readonly relatedTrade?: TrackCTrade;
  readonly sections?: readonly TrackCSection[];
  readonly description: string;
  readonly sourceContact: string;
  readonly sourceRecordedAt: string;
  readonly changeOrderCandidate: TrackBChangeOrderCandidate;
  readonly status: TrackBAdditionalScopeStatus;
  readonly createdAt: string;
  readonly createdBy: string;
}

export type TrackBAdditionalScopeDraftResult =
  | { readonly ok: true; readonly value: TrackBAdditionalScopeDraft }
  | { readonly ok: false; readonly error: string };

export const createTrackBAdditionalScopeDraft = (
  input: TrackBAdditionalScopeDraftInput,
): TrackBAdditionalScopeDraftResult => {
  if (!input.description.trim()) {
    return {
      ok: false,
      error: 'Describe the additional scope before creating a personal draft.',
    };
  }
  if (!input.sourceContact.trim()) {
    return {
      ok: false,
      error: 'Record who reported the additional scope.',
    };
  }

  return {
    ok: true,
    value: {
      id: input.id,
      unitId: input.unitId,
      scopeType: input.scopeType,
      relatedTrade: input.relatedTrade,
      sections: [...new Set(input.sections ?? [])],
      description: input.description,
      sourceContact: input.sourceContact,
      sourceRecordedAt: input.sourceRecordedAt,
      changeOrderCandidate: input.changeOrderCandidate,
      status: input.status,
      createdAt: input.createdAt,
      createdBy: input.createdBy,
      personalDraftOnly: true,
      blocksStandardWork: false,
      officialChangeOrderCreated: false,
      officialFormSubmitted: false,
      persistenceOwner: 'integration',
    },
  };
};

export const TRACK_B_ADDITIONAL_SCOPE_BOUNDARY = Object.freeze({
  persistence: 'integration-owned',
  officialChangeOrder: false,
  officialSubmission: false,
  blocksPaintOrClean: false,
});
