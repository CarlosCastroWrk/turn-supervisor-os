import {
  Check,
  ClipboardCheck,
  RotateCcw,
  ShieldCheck,
  TimerReset,
  UserRound,
} from 'lucide-react';
import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  createTrackBOfficialFormRequest,
  type TrackBOfficialFormRequest,
  type TrackBPropertyContact,
} from '../wave2a21-track-b/contracts';
import {
  acquireTrackBOneShot,
  releaseTrackBOneShot,
} from '../wave2a21-track-b/oneShot';
import {
  type TrackCState,
  type TrackCWalkOutcome,
  type TrackCWorkTarget,
  trackCSectionLabel,
  trackCWorkKey,
} from './model';
import {
  endTrackCWalk,
  startTrackCWalk,
  updateTrackCActiveWalkOutcomes,
} from './operations';
import {
  projectTrackCWalkCandidates,
  projectTrackCWork,
  trackCCrewName,
  trackCUnitForTarget,
} from './projections';

export interface WalkViewProps {
  readonly state: TrackCState;
  readonly createId: (prefix: string) => string;
  readonly now: () => string;
  readonly propertyContacts?: readonly TrackBPropertyContact[];
  readonly outcomes: Readonly<Record<string, TrackCWalkOutcome>>;
  readonly onOutcomesChange: Dispatch<
    SetStateAction<Readonly<Record<string, TrackCWalkOutcome>>>
  >;
  readonly onOfficialFormRequested?: (
    request: TrackBOfficialFormRequest,
  ) => void;
  readonly onRequestMirror: (target: TrackCWorkTarget) => void;
  readonly onStateChange: (state: TrackCState, reason: string) => void;
}

const OUTCOMES: readonly {
  outcome: TrackCWalkOutcome;
  label: string;
}[] = [
  { outcome: 'accepted', label: 'Accepted' },
  { outcome: 'correction-requested', label: 'Correction' },
  { outcome: 'not-walked', label: 'Not walked' },
  { outcome: 'deferred', label: 'Deferred' },
];

export const WalkView = ({
  state,
  createId,
  now,
  propertyContacts = [],
  outcomes,
  onOutcomesChange,
  onOfficialFormRequested,
  onRequestMirror,
  onStateChange,
}: WalkViewProps) => {
  const candidates = useMemo(() => projectTrackCWalkCandidates(state), [state]);
  const [propertyContact, setPropertyContact] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<readonly string[]>([]);
  const [confirmedInspection, setConfirmedInspection] = useState(false);
  const [message, setMessage] = useState<string>();
  const outcomesRef = useRef(outcomes);
  const startGuardRef = useRef(false);
  const endGuardRef = useRef(false);

  useEffect(() => {
    outcomesRef.current = outcomes;
  }, [outcomes]);

  useEffect(() => {
    const restored = Object.fromEntries(
      (state.activeWalk?.outcomes ?? []).map((outcome) => [
        trackCWorkKey(outcome.target),
        outcome.outcome,
      ]),
    );
    outcomesRef.current = restored;
    onOutcomesChange(restored);
  }, [onOutcomesChange, state.activeWalk?.id, state.activeWalk?.outcomes]);

  const candidateByKey = useMemo(
    () =>
      new Map(
        candidates.map((candidate) => [trackCWorkKey(candidate.target), candidate]),
      ),
    [candidates],
  );

  const toggleCandidate = (target: TrackCWorkTarget) => {
    const key = trackCWorkKey(target);
    setSelectedKeys((current) =>
      current.includes(key)
        ? current.filter((candidate) => candidate !== key)
        : [...current, key],
    );
  };

  const start = () => {
    if (!acquireTrackBOneShot(startGuardRef)) return;
    const selectedTargets = selectedKeys
      .map((key) => candidateByKey.get(key)?.target)
      .filter((target): target is TrackCWorkTarget => Boolean(target));
    const result = startTrackCWalk(state, {
      walkSessionId: createId('track-c-walk'),
      propertyContact,
      selectedTargets,
      startedAt: now(),
      startedBy: 'Los',
      confirmedLosInspection: confirmedInspection,
    });
    if (!result.ok) {
      releaseTrackBOneShot(startGuardRef);
      setMessage(result.error.message);
      return;
    }
    setMessage(undefined);
    outcomesRef.current = {};
    onOutcomesChange({});
    onStateChange(result.value, 'walk-started');
  };

  const end = () => {
    if (!state.activeWalk || !acquireTrackBOneShot(endGuardRef)) return;
    const result = endTrackCWalk(state, {
      endedAt: now(),
      recordedBy: 'Los',
      eventIdPrefix: `track-b-walk-outcome:${state.activeWalk.id}`,
      outcomes: state.activeWalk.selectedTargets.map((target) => ({
        target,
        outcome: outcomesRef.current[trackCWorkKey(target)],
      })),
    });
    if (!result.ok) {
      releaseTrackBOneShot(endGuardRef);
      setMessage(result.error.message);
      return;
    }
    setMessage(
      `${state.activeWalk.selectedTargets.length} exact section/trade outcomes recorded.`,
    );
    setSelectedKeys([]);
    setConfirmedInspection(false);
    outcomesRef.current = {};
    onOutcomesChange({});
    onStateChange(result.value, 'walk-ended');
  };

  const recordOutcome = (
    target: TrackCWorkTarget,
    outcome: TrackCWalkOutcome,
  ) => {
    const key = trackCWorkKey(target);
    const nextOutcomes = {
      ...outcomesRef.current,
      [key]: outcome,
    };
    const result = updateTrackCActiveWalkOutcomes(
      state,
      state.activeWalk?.selectedTargets.flatMap((selectedTarget) => {
        const selectedOutcome =
          nextOutcomes[trackCWorkKey(selectedTarget)];
        return selectedOutcome
          ? [{ target: selectedTarget, outcome: selectedOutcome }]
          : [];
      }) ?? [],
    );
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    outcomesRef.current = nextOutcomes;
    onOutcomesChange(nextOutcomes);
    onStateChange(result.value, 'walk-outcome-draft-saved');
  };

  const latestWalk =
    state.completedWalks[state.completedWalks.length - 1];
  const eligibleMirrors =
    latestWalk?.outcomes
      ?.filter((outcome) => outcome.outcome === 'accepted')
      .filter((outcome) => {
        const projection = projectTrackCWork(state, outcome.target);
        return projection && !projection.personalPdsMirror;
      }) ?? [];

  if (state.activeWalk) {
    const allRecorded = state.activeWalk.selectedTargets.every((target) =>
      Boolean(outcomesRef.current[trackCWorkKey(target)])
    );
    return (
      <section className="track-c-walk" aria-labelledby="track-c-active-walk-heading">
        <header className="track-c-view-heading">
          <div>
            <h1 id="track-c-active-walk-heading">Walk in progress</h1>
            <p>With {state.activeWalk.propertyContact}</p>
          </div>
          <span>{state.activeWalk.selectedTargets.length} items</span>
        </header>
        <p className="track-c-walk__instruction">
          Record one exact result for each section and trade. No Unit-wide approval.
        </p>
        <div className="track-c-walk-items">
          {state.activeWalk.selectedTargets.map((target) => {
            const unit = trackCUnitForTarget(state, target);
            const projection = projectTrackCWork(state, target);
            const key = trackCWorkKey(target);
            return (
              <section key={key}>
                <header>
                  <div>
                    <strong>Unit {unit?.unitNumber}</strong>
                    <span>
                      {target.trade === 'paint' ? 'Paint' : 'Clean'} ·{' '}
                      {trackCSectionLabel(target.section)}
                    </span>
                  </div>
                  <small>{trackCCrewName(state, projection?.responsibleCrewId)}</small>
                </header>
                <div className="track-c-outcome-grid">
                  {OUTCOMES.map((item) => (
                    <button
                      aria-pressed={
                        outcomesRef.current[key] === item.outcome
                      }
                      data-track-c-critical-target="true"
                      key={item.outcome}
                      onClick={() => recordOutcome(target, item.outcome)}
                      type="button"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
        <div className="track-c-sticky-action">
          <button
            className="track-c-primary-button"
            data-track-c-critical-target="true"
            disabled={!allRecorded}
            onClick={end}
            type="button"
          >
            End Walk and review
          </button>
        </div>
      </section>
    );
  }

  if (candidates.length === 0) {
    return (
      <section
        className="track-c-walk"
        aria-labelledby="track-c-walk-heading"
      >
        <header className="track-c-view-heading">
          <div>
            <h1 id="track-c-walk-heading">Start Walk</h1>
            <p>Los-passed, pending, and unblocked only</p>
          </div>
          <span>0 ready</span>
        </header>
        <div className="track-c-empty">
          <ClipboardCheck aria-hidden="true" size={24} />
          <h2>No work is ready to walk</h2>
          <p>
            Work appears here only after Los passes inspection and every
            blocker is clear.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="track-c-walk" aria-labelledby="track-c-walk-heading">
      <header className="track-c-view-heading">
        <div>
          <h1 id="track-c-walk-heading">Start Walk</h1>
          <p>Los-passed, pending, and unblocked only</p>
        </div>
        <span>{candidates.length} ready</span>
      </header>
      <div className="track-c-form-stack">
        {propertyContacts.length > 0 ? (
          <label className="track-c-field">
            <span>Who are you walking with?</span>
            <span className="track-c-field__input">
              <UserRound aria-hidden="true" size={18} />
              <select
                aria-label="Property walkthrough contact"
                onChange={(event) => setPropertyContact(event.target.value)}
                value={propertyContact}
              >
                <option value="">Choose property contact</option>
                {propertyContacts.map((contact) => (
                  <option key={contact.id} value={contact.name}>
                    {contact.name}
                    {contact.roleLabel ? ` · ${contact.roleLabel}` : ''}
                  </option>
                ))}
              </select>
            </span>
          </label>
        ) : (
          <label className="track-c-field">
            <span>Who are you walking with?</span>
            <span className="track-c-field__input">
              <UserRound aria-hidden="true" size={18} />
              <input
                onChange={(event) => setPropertyContact(event.target.value)}
                placeholder="Property contact"
                type="text"
                value={propertyContact}
              />
            </span>
          </label>
        )}
        <fieldset className="track-c-choice-list track-c-walk-candidates">
          <legend>Select exact work</legend>
          {candidates.map((candidate) => {
            const key = trackCWorkKey(candidate.target);
            return (
              <label key={key}>
                <input
                  checked={selectedKeys.includes(key)}
                  onChange={() => toggleCandidate(candidate.target)}
                  type="checkbox"
                />
                <span>
                  <strong>
                    Unit {candidate.unitNumber} ·{' '}
                    {candidate.target.trade === 'paint' ? 'Paint' : 'Clean'}{' '}
                    {trackCSectionLabel(candidate.target.section)}
                  </strong>
                  <small>
                    {trackCCrewName(state, candidate.crewId)} ·{' '}
                    {candidate.locationLabel}
                  </small>
                </span>
              </label>
            );
          })}
        </fieldset>
        <label className="track-c-confirm-row">
          <input
            checked={confirmedInspection}
            onChange={(event) => setConfirmedInspection(event.target.checked)}
            type="checkbox"
          />
          <span>
            <strong>I inspected every selected item</strong>
            <small>Property acceptance remains separate until the walk outcome.</small>
          </span>
        </label>
        <button
          className="track-c-primary-button"
          data-track-c-critical-target="true"
          disabled={
            !propertyContact.trim() ||
            selectedKeys.length === 0 ||
            !confirmedInspection
          }
          onClick={start}
          type="button"
        >
          <ShieldCheck aria-hidden="true" size={18} />
          Start Walk
        </button>
      </div>
      {latestWalk ? (
        <section className="track-c-walk-summary">
          <header>
            <h2>Latest walk</h2>
            <span>{latestWalk.propertyContact}</span>
          </header>
          <div className="track-c-stat-grid">
            {OUTCOMES.map((item) => (
              <div key={item.outcome}>
                <strong>
                  {latestWalk.outcomes?.filter(
                    (outcome) => outcome.outcome === item.outcome,
                  ).length ?? 0}
                </strong>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
          <p className="track-c-boundary-copy">
            Accepted items are personal records only. Corrections preserve the
            responsible crew and require reinspection.
          </p>
          {eligibleMirrors.length > 0 ? (
            <div className="track-c-mirror-list">
              <h3>Eligible personal paper mirrors</h3>
              {eligibleMirrors.map((outcome) => {
                const unit = trackCUnitForTarget(state, outcome.target);
                const key = trackCWorkKey(outcome.target);
                return (
                  <button
                    data-track-c-critical-target="true"
                    key={key}
                    onClick={() => onRequestMirror(outcome.target)}
                    type="button"
                  >
                    <Check aria-hidden="true" size={17} />
                    Unit {unit?.unitNumber} ·{' '}
                    {outcome.target.trade === 'paint' ? 'Paint' : 'Clean'}{' '}
                    {trackCSectionLabel(outcome.target.section)}
                  </button>
                );
              })}
            </div>
          ) : null}
          {onOfficialFormRequested && eligibleMirrors.length > 0 ? (
            <button
              data-track-c-critical-target="true"
              onClick={() =>
                onOfficialFormRequested(
                  createTrackBOfficialFormRequest(
                    eligibleMirrors.map((outcome) => outcome.target),
                  ),
                )}
              type="button"
            >
              Open Turn Sign-Off form
            </button>
          ) : null}
          {onOfficialFormRequested && eligibleMirrors.length > 0 ? (
            <p className="track-c-boundary-copy">
              Opens the reviewed external form only. Turn OS does not prefill or
              submit it.
            </p>
          ) : null}
          <p className="track-c-paper-reminder">
            <TimerReset aria-hidden="true" size={17} />
            {state.terminology.paperReminder}
          </p>
        </section>
      ) : null}
      {message ? (
        <div className="track-c-receipt" role="status">
          <RotateCcw aria-hidden="true" size={18} />
          <span><strong>{message}</strong></span>
        </div>
      ) : null}
    </section>
  );
};
