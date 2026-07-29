import type {
  TrackCTrade,
  TrackCWorkTarget,
} from '../wave2a2-track-c/model';

export interface TrackBPropertyContact {
  readonly id: string;
  readonly name: string;
  readonly roleLabel?: string;
}

export interface TrackBWorkNavigationRequest {
  readonly target: TrackCWorkTarget;
  readonly source: 'crew-detail';
}

export interface TrackBOfficialFormRequest {
  readonly form: 'turn-sign-off';
  readonly targets: readonly TrackCWorkTarget[];
  readonly source: 'property-accepted-context';
  readonly prefill: false;
  readonly submit: false;
  readonly personalRecordOnly: true;
}

export const resolveTrackBActiveCrewIds = (
  crews: readonly {
    readonly id: string;
    readonly trade: TrackCTrade;
    readonly activeToday: boolean;
  }[],
  activeCrewIds?: readonly string[],
): readonly string[] => {
  const knownCrewIds = new Set(crews.map((crew) => crew.id));
  const source =
    activeCrewIds ??
    crews.filter((crew) => crew.activeToday).map((crew) => crew.id);
  return [...new Set(source)].filter((crewId) => knownCrewIds.has(crewId));
};

export const createTrackBOfficialFormRequest = (
  targets: readonly TrackCWorkTarget[],
): TrackBOfficialFormRequest => ({
  form: 'turn-sign-off',
  targets,
  source: 'property-accepted-context',
  prefill: false,
  submit: false,
  personalRecordOnly: true,
});

export const trackBAssignmentConfirmationPrefix = (proposalId: string) =>
  `track-b-assignment:${proposalId}`;
