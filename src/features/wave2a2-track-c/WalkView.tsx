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
  useMemo,
  useState,
} from 'react';
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
} from './operations';
import {
  projectTrackCWalkCandidates,
  projectTrackCWork,
  trackCCrewName,
  trackCUnitForTarget,
} from './projections';

interface WalkViewProps {
  readonly state: TrackCState;
  readonly createId: (prefix: string) => string;
  readonly now: () => string;
  readonly outcomes: Readonly<Record<string, TrackCWalkOutcome>>;
  readonly onOutcomesChange: Dispatch<
    SetStateAction<Readonly<Record<string, TrackCWalkOutcome>>>
  >;
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
  outcomes,
  onOutcomesChange,
  onRequestMirror,
  onStateChange,
}: WalkViewProps) => {
  const candidates = useMemo(() => projectTrackCWalkCandidates(state), [state]);
  const [propertyContact, setPropertyContact] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<readonly string[]>([]);
  const [confirmedInspection, setConfirmedInspection] = useState(false);
  const [message, setMessage] = useState<string>();

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
      setMessage(result.error.message);
      return;
    }
    setMessage(undefined);
    onOutcomesChange({});
    onStateChange(result.value, 'walk-started');
  };

  const end = () => {
    if (!state.activeWalk) return;
    const result = endTrackCWalk(state, {
      endedAt: now(),
      recordedBy: 'Los',
      eventIdPrefix: createId('track-c-walk-outcome'),
      outcomes: state.activeWalk.selectedTargets.map((target) => ({
        target,
        outcome: outcomes[trackCWorkKey(target)],
      })),
    });
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    setMessage(
      `${state.activeWalk.selectedTargets.length} exact section/trade outcomes recorded.`,
    );
    setSelectedKeys([]);
    setConfirmedInspection(false);
    onOutcomesChange({});
    onStateChange(result.value, 'walk-ended');
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
      Boolean(outcomes[trackCWorkKey(target)])
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
                      aria-pressed={outcomes[key] === item.outcome}
                      data-track-c-critical-target="true"
                      key={item.outcome}
                      onClick={() =>
                        onOutcomesChange((current) => ({
                          ...current,
                          [key]: item.outcome,
                        }))}
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
        <fieldset className="track-c-choice-list track-c-walk-candidates">
          <legend>Select exact work</legend>
          {candidates.length > 0 ? (
            candidates.map((candidate) => {
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
                      {trackCCrewName(state, candidate.crewId)} · {candidate.locationLabel}
                    </small>
                  </span>
                </label>
              );
            })
          ) : (
            <div className="track-c-empty">
              <ClipboardCheck aria-hidden="true" size={24} />
              <h2>No walk candidates</h2>
              <p>Items appear only after Los passes inspection and blockers are clear.</p>
            </div>
          )}
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
