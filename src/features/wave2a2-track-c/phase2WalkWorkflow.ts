import {
  type TrackCState,
  type TrackCWalkOutcome,
  type TrackCWalkOutcomeRecord,
  type TrackCWalkSession,
  type TrackCWorkTarget,
  trackCWorkKey,
} from './model';

export type TrackCWalkDraftStage = 'active' | 'end-review';

export interface TrackCWalkDraft {
  readonly version: 1;
  readonly walkSessionId: string;
  readonly stage: TrackCWalkDraftStage;
  readonly outcomes: readonly TrackCWalkOutcomeRecord[];
  readonly updatedAt: string;
}

export interface TrackCWalkSummary {
  readonly accepted: number;
  readonly correctionsRequested: number;
  readonly deferred: number;
  readonly notWalked: number;
  readonly notes: readonly TrackCWalkOutcomeRecord[];
  readonly openCallbacks: number;
}

const WALK_OUTCOMES = new Set<TrackCWalkOutcome>([
  'accepted',
  'correction-requested',
  'deferred',
  'not-walked',
]);

const isWalkOutcome = (value: unknown): value is TrackCWalkOutcome =>
  typeof value === 'string' &&
  WALK_OUTCOMES.has(value as TrackCWalkOutcome);

const isWalkDraftStage = (value: unknown): value is TrackCWalkDraftStage =>
  value === 'active' || value === 'end-review';

const canonicalOutcomes = (
  session: TrackCWalkSession,
  candidates: unknown,
): readonly TrackCWalkOutcomeRecord[] => {
  if (!Array.isArray(candidates)) return [];

  const targetsByKey = new Map(
    session.selectedTargets.map((target) => [trackCWorkKey(target), target]),
  );
  const outcomesByKey = new Map<string, TrackCWalkOutcomeRecord>();

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const record = candidate as Partial<TrackCWalkOutcomeRecord>;
    if (!record.target || !isWalkOutcome(record.outcome)) continue;
    const target = targetsByKey.get(trackCWorkKey(record.target));
    if (!target) continue;
    outcomesByKey.set(trackCWorkKey(target), {
      target,
      outcome: record.outcome,
      note: typeof record.note === 'string' ? record.note : undefined,
    });
  }

  return session.selectedTargets
    .map((target) => outcomesByKey.get(trackCWorkKey(target)))
    .filter(
      (outcome): outcome is TrackCWalkOutcomeRecord => Boolean(outcome),
    );
};

export const restoreTrackCWalkDraft = (
  session: TrackCWalkSession,
  restored: unknown,
  updatedAt: string,
): TrackCWalkDraft => {
  const source =
    restored &&
    typeof restored === 'object' &&
    (restored as Partial<TrackCWalkDraft>).version === 1 &&
    (restored as Partial<TrackCWalkDraft>).walkSessionId === session.id
      ? (restored as Partial<TrackCWalkDraft>)
      : undefined;
  const sessionOutcomes = canonicalOutcomes(session, session.outcomes);
  const restoredOutcomes = source
    ? canonicalOutcomes(session, source.outcomes)
    : [];
  const outcomesByKey = new Map(
    [...sessionOutcomes, ...restoredOutcomes].map((outcome) => [
      trackCWorkKey(outcome.target),
      outcome,
    ]),
  );

  return {
    version: 1,
    walkSessionId: session.id,
    stage: source && isWalkDraftStage(source.stage) ? source.stage : 'active',
    outcomes: session.selectedTargets
      .map((target) => outcomesByKey.get(trackCWorkKey(target)))
      .filter(
        (outcome): outcome is TrackCWalkOutcomeRecord => Boolean(outcome),
      ),
    updatedAt:
      source && typeof source.updatedAt === 'string'
        ? source.updatedAt
        : updatedAt,
  };
};

export const updateTrackCWalkDraft = (
  draft: TrackCWalkDraft,
  target: TrackCWorkTarget,
  update: {
    readonly outcome?: TrackCWalkOutcome;
    readonly note?: string;
    readonly stage?: TrackCWalkDraftStage;
  },
  updatedAt: string,
): TrackCWalkDraft => {
  const key = trackCWorkKey(target);
  const current = draft.outcomes.find(
    (outcome) => trackCWorkKey(outcome.target) === key,
  );
  const outcome = update.outcome ?? current?.outcome;
  const nextOutcomes = outcome
    ? [
        ...draft.outcomes.filter(
          (candidate) => trackCWorkKey(candidate.target) !== key,
        ),
        {
          target,
          outcome,
          note: update.note ?? current?.note,
        },
      ]
    : draft.outcomes;

  return {
    ...draft,
    stage: update.stage ?? draft.stage,
    outcomes: nextOutcomes,
    updatedAt,
  };
};

export const setTrackCWalkDraftStage = (
  draft: TrackCWalkDraft,
  stage: TrackCWalkDraftStage,
  updatedAt: string,
): TrackCWalkDraft => ({
  ...draft,
  stage,
  updatedAt,
});

export const isTrackCWalkDraftComplete = (
  session: TrackCWalkSession,
  draft: TrackCWalkDraft,
): boolean => {
  if (draft.walkSessionId !== session.id) return false;
  const outcomeKeys = new Set(draft.outcomes.map((outcome) =>
    trackCWorkKey(outcome.target)));
  return session.selectedTargets.every((target) =>
    outcomeKeys.has(trackCWorkKey(target)));
};

export const applyTrackCWalkDraft = (
  state: TrackCState,
  draft: TrackCWalkDraft,
): TrackCState => {
  if (!state.activeWalk || state.activeWalk.id !== draft.walkSessionId) {
    return state;
  }
  return {
    ...state,
    activeWalk: {
      ...state.activeWalk,
      outcomes: canonicalOutcomes(state.activeWalk, draft.outcomes),
    },
  };
};

export const summarizeTrackCWalkDraft = (
  draft: TrackCWalkDraft,
): TrackCWalkSummary => ({
  accepted: draft.outcomes.filter((item) => item.outcome === 'accepted').length,
  correctionsRequested: draft.outcomes.filter(
    (item) => item.outcome === 'correction-requested',
  ).length,
  deferred: draft.outcomes.filter((item) => item.outcome === 'deferred').length,
  notWalked: draft.outcomes.filter((item) => item.outcome === 'not-walked').length,
  notes: draft.outcomes.filter((item) => Boolean(item.note?.trim())),
  openCallbacks: draft.outcomes.filter(
    (item) => item.outcome === 'correction-requested',
  ).length,
});
