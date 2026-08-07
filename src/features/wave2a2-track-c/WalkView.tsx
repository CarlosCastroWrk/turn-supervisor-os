import {
  ArrowLeft,
  Check,
  ClipboardCheck,
  ExternalLink,
  ListChecks,
  RotateCcw,
  ShieldCheck,
  TimerReset,
  UserRound,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  type TrackCState,
  type TrackCTrade,
  type TrackCWalkOutcome,
  type TrackCWalkOutcomeRecord,
  type TrackCWalkSession,
  type TrackCWorkTarget,
  paintWorkTypeLabel,
  trackCSectionLabel,
  trackCWorkKey,
} from './model';
import { buildWalkReceiptText } from './walkReceipt';
import {
  applyTrackCWalkDraft,
  isTrackCWalkDraftComplete,
  restoreTrackCWalkDraft,
  setTrackCWalkDraftStage,
  summarizeTrackCWalkDraft,
  type TrackCWalkDraft,
  type TrackCWalkSummary,
  updateTrackCWalkDraft,
} from './phase2WalkWorkflow';
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
import './phase2WalkWorkflow.css';

export interface TrackCWalkContactOption {
  readonly id: string;
  readonly name: string;
  readonly role?: string;
  readonly isPrimary?: boolean;
}

export interface TrackCWalkLifecycleEvent {
  readonly type: 'started' | 'ended';
  readonly walkSessionId: string;
  readonly recordedAt: string;
  readonly propertyContactId?: string;
  readonly propertyContactName: string;
  readonly selectedTargets: readonly TrackCWorkTarget[];
  readonly summary?: TrackCWalkSummary;
}

export interface TrackCWalkIntegration {
  readonly contacts?: readonly TrackCWalkContactOption[];
  readonly restoredDraft?: TrackCWalkDraft;
  readonly onDraftChange?: (draft: TrackCWalkDraft | undefined) => void;
  readonly onLifecycleEvent?: (event: TrackCWalkLifecycleEvent) => void;
  readonly onOpenTurnSignOff?: (walkSessionId: string) => void;
  readonly onReturnToBoard?: () => void;
  readonly onViewWorkNeedingInspection?: () => void;
}

interface WalkViewProps {
  readonly state: TrackCState;
  readonly createId: (prefix: string) => string;
  readonly now: () => string;
  readonly onRequestMirror: (target: TrackCWorkTarget) => void;
  readonly onStateChange: (state: TrackCState, reason: string) => void;
  readonly integration?: TrackCWalkIntegration;
}

const OUTCOMES: readonly {
  outcome: TrackCWalkOutcome;
  label: string;
}[] = [
  { outcome: 'accepted', label: 'Accepted' },
  { outcome: 'correction-requested', label: 'Correction requested' },
  { outcome: 'deferred', label: 'Deferred' },
  { outcome: 'not-walked', label: 'Not walked' },
];

const walkItemLabel = (
  state: TrackCState,
  target: TrackCWorkTarget,
): string => {
  const unit = trackCUnitForTarget(state, target);
  return `Unit ${unit?.unitNumber ?? 'Unknown'} · ${
    target.trade === 'paint' ? 'Paint' : 'Clean'
  } · ${trackCSectionLabel(target.section)}`;
};

const walkPackageKey = (
  target: Pick<TrackCWorkTarget, 'trade' | 'unitId'>,
) => `${target.unitId}:${target.trade}`;

interface WalkPackage {
  readonly key: string;
  readonly trade: TrackCTrade;
  readonly unitId: string;
  readonly targets: readonly TrackCWorkTarget[];
}

const groupWalkTargets = (
  targets: readonly TrackCWorkTarget[],
): readonly WalkPackage[] => {
  const packages = new Map<string, TrackCWorkTarget[]>();
  for (const target of targets) {
    const key = walkPackageKey(target);
    packages.set(key, [...(packages.get(key) ?? []), target]);
  }
  return [...packages.entries()].map(([key, packageTargets]) => ({
    key,
    trade: packageTargets[0].trade,
    unitId: packageTargets[0].unitId,
    targets: packageTargets,
  }));
};

const walkPackageLabel = (
  state: TrackCState,
  item: WalkPackage,
): string => {
  const unit = trackCUnitForTarget(state, item.targets[0]);
  return `Unit ${unit?.unitNumber ?? 'Unknown'} · ${
    item.trade === 'paint' ? 'Paint' : 'Clean'
  }`;
};

const packageOutcome = (
  draft: TrackCWalkDraft,
  item: WalkPackage,
): TrackCWalkOutcome | 'mixed' | undefined => {
  const outcomes = item.targets
    .map((target) => draft.outcomes.find(
      (outcome) => trackCWorkKey(outcome.target) === trackCWorkKey(target),
    )?.outcome)
    .filter((outcome): outcome is TrackCWalkOutcome => Boolean(outcome));
  if (outcomes.length !== item.targets.length) return undefined;
  if (outcomes.every((outcome) => outcome === outcomes[0])) return outcomes[0];
  if (outcomes.every((outcome) =>
    outcome === 'accepted' || outcome === 'correction-requested')) {
    return 'correction-requested';
  }
  return 'mixed';
};

const packageSections = (item: WalkPackage) =>
  item.targets.map((target) => trackCSectionLabel(target.section)).join(', ');

interface ActiveWalkProps {
  readonly activeWalk: TrackCWalkSession;
  readonly createId: (prefix: string) => string;
  readonly integration?: TrackCWalkIntegration;
  readonly now: () => string;
  readonly onStateChange: (state: TrackCState, reason: string) => void;
  readonly state: TrackCState;
}

const ActiveWalk = ({
  activeWalk,
  createId,
  integration,
  now,
  onStateChange,
  state,
}: ActiveWalkProps) => {
  const [draft, setDraft] = useState(() =>
    restoreTrackCWalkDraft(activeWalk, integration?.restoredDraft, now()));
  const [message, setMessage] = useState<string>();
  const allRecorded = isTrackCWalkDraftComplete(activeWalk, draft);
  const summary = summarizeTrackCWalkDraft(draft);
  const walkPackages = useMemo(
    () => groupWalkTargets(activeWalk.selectedTargets),
    [activeWalk.selectedTargets],
  );
  const packageSummary = useMemo(() => {
    const outcomes = walkPackages.map((item) => packageOutcome(draft, item));
    return {
      accepted: outcomes.filter((outcome) => outcome === 'accepted').length,
      correctionsRequested: outcomes.filter(
        (outcome) => outcome === 'correction-requested',
      ).length,
      deferred: outcomes.filter((outcome) => outcome === 'deferred').length,
      notWalked: outcomes.filter((outcome) => outcome === 'not-walked').length,
    };
  }, [draft, walkPackages]);

  const commitDraft = (nextDraft: TrackCWalkDraft) => {
    onStateChange(
      applyTrackCWalkDraft(state, nextDraft),
      'walk-draft-updated',
    );
    integration?.onDraftChange?.(nextDraft);
    setDraft(nextDraft);
  };

  const reviewEndWalk = () => {
    if (!allRecorded) return;
    commitDraft(setTrackCWalkDraftStage(draft, 'end-review', now()));
  };

  const continueWalk = () => {
    setMessage(undefined);
    commitDraft(setTrackCWalkDraftStage(draft, 'active', now()));
  };

  const updatePackage = (
    item: WalkPackage,
    update: {
      readonly outcome?: TrackCWalkOutcome;
      readonly note?: string;
    },
  ) => {
    const updatedAt = now();
    const nextDraft = item.targets.reduce(
      (current, target) => updateTrackCWalkDraft(
        current,
        target,
        update,
        updatedAt,
      ),
      draft,
    );
    commitDraft(nextDraft);
  };


  const endWalk = () => {
    const endedAt = now();
    const result = endTrackCWalk(state, {
      endedAt,
      recordedBy: 'Los',
      eventIdPrefix: createId('track-c-walk-outcome'),
      outcomes: draft.outcomes,
    });
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    onStateChange(result.value, 'walk-ended');
    integration?.onLifecycleEvent?.({
      type: 'ended',
      walkSessionId: activeWalk.id,
      recordedAt: endedAt,
      propertyContactName: activeWalk.propertyContact,
      selectedTargets: activeWalk.selectedTargets,
      summary,
    });
    integration?.onDraftChange?.(undefined);
  };

  if (draft.stage === 'end-review') {
    return (
      <section
        aria-labelledby="track-c-end-walk-heading"
        className="track-c-walk track-c-walk-review"
      >
        <header className="track-c-view-heading">
          <div>
            <h1 id="track-c-end-walk-heading">Review End Walk</h1>
            <p>With {activeWalk.propertyContact}</p>
          </div>
          <span>{walkPackages.length} Unit+Trade jobs</span>
        </header>
        <div className="track-c-walk-review__body">
          <section
            aria-label="Walk outcome summary"
            className="track-c-walk-review__summary"
          >
            <div>
              <strong>{packageSummary.accepted}</strong>
              <span>Accepted</span>
            </div>
            <div>
              <strong>{packageSummary.correctionsRequested}</strong>
              <span>Corrections</span>
            </div>
            <div>
              <strong>{packageSummary.deferred}</strong>
              <span>Deferred</span>
            </div>
            <div>
              <strong>{packageSummary.notWalked}</strong>
              <span>Not walked</span>
            </div>
          </section>
          <section className="track-c-walk-review__details">
            <h2>Walk details</h2>
            <dl>
              <div>
                <dt>Notes</dt>
                <dd>{summary.notes.length}</dd>
              </div>
              <div>
                <dt>Open callbacks after End Walk</dt>
                <dd>{summary.openCallbacks}</dd>
              </div>
            </dl>
            {summary.notes.length > 0 ? (
              <ul>
                {summary.notes.map((outcome) => (
                  <li key={trackCWorkKey(outcome.target)}>
                    <strong>{walkItemLabel(state, outcome.target)}</strong>
                    <span>{outcome.note}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No walk notes recorded.</p>
            )}
          </section>
          <p className="track-c-paper-reminder">
            <TimerReset aria-hidden="true" size={17} />
            {state.terminology.paperReminder}
          </p>
          <p className="track-c-boundary-copy">
            Accepted is a personal property-walk record only. It does not change
            payroll, submit a form, or update the official paper TurnBoard.
          </p>
          {message ? (
            <div className="track-c-receipt is-error" role="alert">
              <RotateCcw aria-hidden="true" size={18} />
              <span>
                <strong>{message}</strong>
              </span>
            </div>
          ) : null}
        </div>
        <div className="track-c-walk-review__actions">
          <button
            data-track-c-critical-target="true"
            onClick={continueWalk}
            type="button"
          >
            <ArrowLeft aria-hidden="true" size={18} />
            Continue Walk
          </button>
          <button
            data-track-c-critical-target="true"
            disabled={!integration?.onOpenTurnSignOff}
            onClick={() => integration?.onOpenTurnSignOff?.(activeWalk.id)}
            type="button"
          >
            <ExternalLink aria-hidden="true" size={18} />
            Open official Turn Sign-Off
          </button>
          <button
            className="track-c-primary-button"
            data-track-c-critical-target="true"
            onClick={endWalk}
            type="button"
          >
            End Walk
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="track-c-active-walk-heading"
      className="track-c-walk"
    >
      <header className="track-c-view-heading">
        <div>
          <h1 id="track-c-active-walk-heading">Active Walk</h1>
          <p>With {activeWalk.propertyContact}</p>
        </div>
        <span>
          {walkPackages.filter((item) => packageOutcome(draft, item)).length}/
          {walkPackages.length}
        </span>
      </header>
      {integration?.onReturnToBoard ? (
        <button
          className="track-c-walk__leave"
          data-track-c-critical-target="true"
          onClick={integration.onReturnToBoard}
          type="button"
        >
          <ArrowLeft aria-hidden="true" size={16} />
          Back to board — the walk stays active
        </button>
      ) : null}
      <p className="track-c-walk__instruction">
        Record one result per Unit+Trade package. A correction still identifies
        the affected sections.
      </p>
      <div className="track-c-walk-items">
        {walkPackages.map((item) => {
          const projection = projectTrackCWork(state, item.targets[0]);
          const recordedOutcome = packageOutcome(draft, item);
          const packageRecords = item.targets
            .map((target) => draft.outcomes.find(
              (outcome) =>
                trackCWorkKey(outcome.target) === trackCWorkKey(target),
            ))
            .filter(
              (outcome): outcome is TrackCWalkOutcomeRecord => Boolean(outcome),
            );
          const note =
            packageRecords.find((record) => record.note?.trim())?.note ?? '';
          return (
            <section key={item.key}>
              <header>
                <div>
                  <strong>{walkPackageLabel(state, item)}</strong>
                  <span>
                    {packageSections(item)} · Responsible crew:{' '}
                    {trackCCrewName(state, projection?.responsibleCrewId)}
                  </span>
                </div>
              </header>
              <div className="track-c-walk-checkoff">
                <span>With {activeWalk.propertyContact} — each section:</span>
                <div className="track-c-walk-checkoff__rows">
                  {item.targets.map((target) => {
                    const record = packageRecords.find(
                      (outcome) =>
                        trackCWorkKey(outcome.target) === trackCWorkKey(target),
                    );
                    const sectionOutcome = record?.outcome;
                    // Show WHAT was done in this room and by WHOM, right on the
                    // walk row — Los always needs to know the task + crew per room,
                    // especially re-walking after a callback.
                    const roomWork = projectTrackCWork(state, target);
                    const taskLabel = roomWork?.trade === 'paint' && roomWork.workType
                      ? paintWorkTypeLabel(roomWork.workType)
                      : '';
                    const doneBy = roomWork?.responsibleCrewId
                      ? trackCCrewName(state, roomWork.responsibleCrewId)
                      : '';
                    return (
                      <div
                        className="track-c-walk-section-row"
                        key={trackCWorkKey(target)}
                      >
                        <strong>
                          {trackCSectionLabel(target.section)}
                          {taskLabel || doneBy ? (
                            <em className="track-c-walk-section-row__detail">
                              {taskLabel ? ` · ${taskLabel}` : ''}
                              {doneBy ? ` · ${doneBy}` : ''}
                            </em>
                          ) : null}
                        </strong>
                        <button
                          aria-pressed={sectionOutcome === 'accepted'}
                          className={sectionOutcome === 'accepted' ? 'is-accepted' : undefined}
                          data-track-c-critical-target="true"
                          onClick={() => {
                            setMessage(undefined);
                            commitDraft(updateTrackCWalkDraft(
                              draft,
                              target,
                              { note: record?.note, outcome: 'accepted' },
                              now(),
                            ));
                          }}
                          type="button"
                        >
                          {sectionOutcome === 'accepted' ? '✓ Accepted' : 'Accepted'}
                        </button>
                        <button
                          aria-pressed={sectionOutcome === 'correction-requested'}
                          className={sectionOutcome === 'correction-requested' ? 'is-needs-work' : undefined}
                          data-track-c-critical-target="true"
                          onClick={() => {
                            setMessage(undefined);
                            commitDraft(updateTrackCWalkDraft(
                              draft,
                              target,
                              { note: record?.note, outcome: 'correction-requested' },
                              now(),
                            ));
                          }}
                          type="button"
                        >
                          Needs work
                        </button>
                      </div>
                    );
                  })}
                </div>
                {recordedOutcome === 'accepted' ? (
                  <p className="track-c-walk-checkoff__done">
                    ✓ Whole {walkPackageLabel(state, item)} accepted — record it on paper.
                  </p>
                ) : null}
                {recordedOutcome === 'correction-requested' ? (
                  <p className="track-c-walk-checkoff__needs-work">
                    Sections marked Needs work become callbacks for the crew when
                    you end the walk.
                  </p>
                ) : null}
                <details className="track-c-walk-more">
                  <summary>More options</summary>
                  <div className="track-c-outcome-grid">
                    {OUTCOMES.filter((choice) =>
                      choice.outcome === 'deferred' || choice.outcome === 'not-walked')
                      .map((choice) => (
                        <button
                          aria-pressed={recordedOutcome === choice.outcome}
                          data-track-c-critical-target="true"
                          key={choice.outcome}
                          onClick={() =>
                            updatePackage(item, { outcome: choice.outcome })
                          }
                          type="button"
                        >
                          {choice.label}
                        </button>
                      ))}
                  </div>
                </details>
              </div>
              <label className="track-c-walk-note">
                <span>Optional note</span>
                <textarea
                  disabled={!recordedOutcome}
                  onChange={(event) =>
                    updatePackage(item, { note: event.target.value })
                  }
                  placeholder={
                    recordedOutcome
                      ? 'Reason or follow-up'
                      : 'Select an outcome first'
                  }
                  rows={2}
                  value={note}
                />
              </label>
            </section>
          );
        })}
      </div>
      <div className="track-c-sticky-action">
        <button
          className="track-c-primary-button"
          data-track-c-critical-target="true"
          disabled={!allRecorded}
          onClick={reviewEndWalk}
          type="button"
        >
          Review End Walk
        </button>
      </div>
    </section>
  );
};

export const WalkView = ({
  state,
  createId,
  now,
  onRequestMirror,
  onStateChange,
  integration,
}: WalkViewProps) => {
  const candidates = useMemo(() => projectTrackCWalkCandidates(state), [state]);
  const contacts = useMemo(
    () =>
      [...(integration?.contacts ?? [])].sort(
        (left, right) =>
          Number(Boolean(right.isPrimary)) - Number(Boolean(left.isPrimary)) ||
          left.name.localeCompare(right.name),
      ),
    [integration?.contacts],
  );
  const [propertyContactId, setPropertyContactId] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<readonly string[]>([]);
  const [confirmedInspection, setConfirmedInspection] = useState(false);
  const [setupStage, setSetupStage] = useState<'select' | 'review'>('select');
  const [message, setMessage] = useState<string>();
  const [receiptStatus, setReceiptStatus] = useState('');

  if (state.activeWalk) {
    return (
      <ActiveWalk
        activeWalk={state.activeWalk}
        createId={createId}
        integration={integration}
        key={state.activeWalk.id}
        now={now}
        onStateChange={onStateChange}
        state={state}
      />
    );
  }

  const candidateByKey = new Map(
    candidates.map((candidate) => [walkPackageKey(candidate.target), candidate]),
  );
  const selectedCandidates = selectedKeys
    .map((key) => candidateByKey.get(key))
    .filter(
      (candidate): candidate is (typeof candidates)[number] =>
        Boolean(candidate),
    );
  const selectedContact = contacts.find(
    (contact) => contact.id === propertyContactId,
  );
  const latestWalk = state.completedWalks[state.completedWalks.length - 1];
  const eligibleMirrors =
    latestWalk?.outcomes
      ?.filter((outcome) => outcome.outcome === 'accepted')
      .filter((outcome) => {
        const projection = projectTrackCWork(state, outcome.target);
        return projection && !projection.personalPdsMirror;
      }) ?? [];
  const latestWalkSummary = latestWalk ? (
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
      <button
        className="track-c-walk-receipt-copy"
        onClick={async () => {
          const receipt = buildWalkReceiptText(state, latestWalk);
          try {
            await navigator.clipboard.writeText(receipt);
            setReceiptStatus(
              `Receipt copied — text it to ${latestWalk.propertyContact}.`,
            );
          } catch {
            setReceiptStatus(receipt);
          }
        }}
        type="button"
      >
        <ClipboardCheck aria-hidden="true" size={17} />
        Copy walk receipt
      </button>
      {receiptStatus ? (
        <p className="track-c-walk-receipt-status" role="status">
          {receiptStatus}
        </p>
      ) : null}
      {eligibleMirrors.length > 0 ? (
        <div className="track-c-mirror-list">
          <h3>Eligible personal paper mirrors</h3>
          {eligibleMirrors.map((outcome) => (
            <button
              data-track-c-critical-target="true"
              key={trackCWorkKey(outcome.target)}
              onClick={() => onRequestMirror(outcome.target)}
              type="button"
            >
              <Check aria-hidden="true" size={17} />
              {walkItemLabel(state, outcome.target)}
            </button>
          ))}
        </div>
      ) : null}
      <p className="track-c-paper-reminder">
        <TimerReset aria-hidden="true" size={17} />
        {state.terminology.paperReminder}
      </p>
    </section>
  ) : null;

  const toggleCandidate = (target: TrackCWorkTarget) => {
    const key = walkPackageKey(target);
    setSelectedKeys((current) =>
      current.includes(key)
        ? current.filter((candidate) => candidate !== key)
        : [...current, key],
    );
  };

  const start = () => {
    if (!selectedContact) return;
    const startedAt = now();
    const selectedTargets = selectedCandidates.flatMap(
      (candidate) => candidate.targets,
    );
    const walkSessionId = createId('track-c-walk');
    const result = startTrackCWalk(state, {
      walkSessionId,
      propertyContact: selectedContact.name,
      selectedTargets,
      startedAt,
      startedBy: 'Los',
      confirmedLosInspection: confirmedInspection,
    });
    if (!result.ok) {
      setMessage(result.error.message);
      setSetupStage('select');
      return;
    }
    setMessage(undefined);
    onStateChange(result.value, 'walk-started');
    integration?.onDraftChange?.(undefined);
    integration?.onLifecycleEvent?.({
      type: 'started',
      walkSessionId,
      recordedAt: startedAt,
      propertyContactId: selectedContact.id,
      propertyContactName: selectedContact.name,
      selectedTargets,
    });
  };

  if (candidates.length === 0) {
    return (
      <>
        <section
          aria-labelledby="track-c-walk-zero-heading"
          className="track-c-walk track-c-walk-zero"
        >
          <ClipboardCheck aria-hidden="true" size={30} />
          <h1 id="track-c-walk-zero-heading">No work is ready to walk.</h1>
          <p>
            Work appears here after Los passes the relevant Paint or Clean
            inspection.
          </p>
          <div className="track-c-walk-zero__actions">
            <button
              data-track-c-critical-target="true"
              onClick={integration?.onReturnToBoard}
              type="button"
            >
              Return to TurnBoard
            </button>
            <button
              data-track-c-critical-target="true"
              onClick={integration?.onViewWorkNeedingInspection}
              type="button"
            >
              View work needing inspection
            </button>
          </div>
        </section>
        {latestWalkSummary}
      </>
    );
  }

  if (contacts.length === 0) {
    return (
      <section
        aria-labelledby="track-c-walk-contact-heading"
        className="track-c-walk track-c-walk-zero"
      >
        <UserRound aria-hidden="true" size={30} />
        <h1 id="track-c-walk-contact-heading">Add a Property Contact first.</h1>
        <p>
          Start Walk uses the saved Project Setup directory. Repeated contact
          typing is not available here.
        </p>
        <button
          data-track-c-critical-target="true"
          onClick={integration?.onReturnToBoard}
          type="button"
        >
          Return to TurnBoard
        </button>
      </section>
    );
  }

  if (setupStage === 'review') {
    return (
      <section
        aria-labelledby="track-c-review-walk-heading"
        className="track-c-walk track-c-start-review"
      >
        <header className="track-c-view-heading">
          <div>
            <h1 id="track-c-review-walk-heading">Review Walk</h1>
            <p>Confirm the contact and Unit+Trade packages</p>
          </div>
          <span>{selectedCandidates.length} Unit+Trade jobs</span>
        </header>
        <div className="track-c-start-review__body">
          <section>
            <h2>Property Contact</h2>
            <strong>{selectedContact?.name}</strong>
            {selectedContact?.role ? <span>{selectedContact.role}</span> : null}
          </section>
          <section>
            <h2>Selected work</h2>
            <ul>
              {selectedCandidates.map((candidate) => (
                <li key={walkPackageKey(candidate.target)}>
                  <strong>
                    Unit {candidate.unitNumber} ·{' '}
                    {candidate.trade === 'paint' ? 'Paint' : 'Clean'}
                  </strong>
                  <span>
                    {candidate.sectionCount} released section
                    {candidate.sectionCount === 1 ? '' : 's'} ·{' '}
                    {trackCCrewName(state, candidate.crewId)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <p className="track-c-boundary-copy">
            Every released section in each selected Unit+Trade package passed
            Los inspection. Property acceptance remains a separate walk outcome.
          </p>
          {message ? (
            <div className="track-c-receipt is-error" role="alert">
              <RotateCcw aria-hidden="true" size={18} />
              <span>
                <strong>{message}</strong>
              </span>
            </div>
          ) : null}
          <div className="track-c-action-row">
            <button
              data-track-c-critical-target="true"
              onClick={() => setSetupStage('select')}
              type="button"
            >
              Edit selection
            </button>
            <button
              className="track-c-primary-button"
              data-track-c-critical-target="true"
              onClick={start}
              type="button"
            >
              <ShieldCheck aria-hidden="true" size={18} />
              Start Walk
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="track-c-walk" aria-labelledby="track-c-walk-heading">
      <header className="track-c-view-heading">
        <div>
          <h1 id="track-c-walk-heading">Start Walk</h1>
          <p>Complete Unit+Trade packages only</p>
        </div>
        <span>{candidates.length} ready</span>
      </header>
      <div className="track-c-form-stack">
        <label className="track-c-field">
          <span>Property Contact</span>
          <span className="track-c-field__input">
            <UserRound aria-hidden="true" size={18} />
            <select
              onChange={(event) => setPropertyContactId(event.target.value)}
              value={propertyContactId}
            >
              <option value="">Select saved contact</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.name}
                  {contact.role ? ` · ${contact.role}` : ''}
                  {contact.isPrimary ? ' · Primary' : ''}
                </option>
              ))}
            </select>
          </span>
        </label>
        <fieldset className="track-c-choice-list track-c-walk-candidates">
          <legend>Select Unit+Trade jobs</legend>
          {candidates.map((candidate) => {
            const key = walkPackageKey(candidate.target);
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
                    {candidate.trade === 'paint' ? 'Paint' : 'Clean'}
                  </strong>
                  <small>
                    {candidate.sectionCount} released section
                    {candidate.sectionCount === 1 ? '' : 's'} ·{' '}
                    {trackCCrewName(state, candidate.crewId)}
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
            <strong>I inspected every released section in these jobs</strong>
            <small>
              Property acceptance remains separate until the walk outcome.
            </small>
          </span>
        </label>
        <button
          className="track-c-primary-button"
          data-track-c-critical-target="true"
          disabled={
            !selectedContact ||
            selectedCandidates.length === 0 ||
            !confirmedInspection
          }
          onClick={() => setSetupStage('review')}
          type="button"
        >
          <ListChecks aria-hidden="true" size={18} />
          Review Walk
        </button>
      </div>
      {latestWalkSummary}
      {message ? (
        <div className="track-c-receipt is-error" role="alert">
          <RotateCcw aria-hidden="true" size={18} />
          <span>
            <strong>{message}</strong>
          </span>
        </div>
      ) : null}
    </section>
  );
};
