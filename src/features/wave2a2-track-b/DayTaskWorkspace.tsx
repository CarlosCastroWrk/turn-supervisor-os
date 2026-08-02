import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileUp,
  Droplets,
  Footprints,
  LogOut,
  Paintbrush,
  Play,
  RotateCcw,
  Sparkles,
  Users,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  END_DAY_SUMMARY_LABELS,
  START_DAY_STEPS,
  applyDayRolloverChoice,
  buildEndDaySummary,
  calculateTodayTaskProgress,
  closeDaySession,
  createTodayTask,
  createTodayTaskGoal,
  getDayRecoveryDecision,
  getTodayTaskQueueCounts,
  markDaySessionEnding,
  passedInspection,
  projectTodayTaskForSession,
  selectTodayTaskQueue,
  startDaySession,
} from './model';
import type {
  DailyReleaseBatch,
  DayKeyStatus,
  DayRolloverChoice,
  DaySession,
  DaySessionEvent,
  EndDayReview,
  PropertyRoster,
  StartDayReview,
  TodayTask,
  TodayTaskQueue,
  TodayTaskQueueId,
  TodayTaskTradeState,
  TrackBCrewOption,
  TrackBTrade,
} from './types';
import './track-b.css';

type WorkspaceView =
  | { id: 'home' }
  | { id: 'start-day' }
  | { id: 'end-day' }
  | { id: 'day-closed' }
  | { id: 'recovery' }
  | { id: 'queue'; queue: TodayTaskQueue };

const queueOrder: readonly TodayTaskQueueId[] = [
  'needs-crew',
  'working',
  'needs-inspection',
  'waiting',
  'callbacks',
  'ready-to-walk',
];

const queueIcons: Readonly<Record<TodayTaskQueueId, ReactNode>> = {
  callbacks: <RotateCcw aria-hidden="true" size={20} />,
  'needs-crew': <Users aria-hidden="true" size={20} />,
  'needs-inspection': <ClipboardList aria-hidden="true" size={20} />,
  'ready-to-walk': <Footprints aria-hidden="true" size={20} />,
  waiting: <AlertTriangle aria-hidden="true" size={20} />,
  working: <Play aria-hidden="true" size={20} />,
};

const nowIso = () => new Date().toISOString();
const createId = () => `day-session-${Date.now()}`;
const formatSessionTime = (value: string) => {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
  }).format(timestamp);
};

const keyStatusLabel: Readonly<Record<DayKeyStatus, string>> = {
  'partial-issue': 'Partial / issue',
  no: 'No',
  yes: 'Yes',
};

const isOpenDay = (session?: DaySession) => (
  session?.status === 'active'
  || session?.status === 'ending'
  || session?.status === 'reopened'
);

interface PageHeaderProps {
  onBack: () => void;
  subtitle?: string;
  title: string;
}

function PageHeader({ onBack, subtitle, title }: PageHeaderProps) {
  return (
    <header className="w2a2b-detail-header">
      <button
        aria-label={`Back from ${title}`}
        className="w2a2b-icon-button"
        data-track-b-critical-target="true"
        onClick={onBack}
        type="button"
      >
        <ArrowLeft aria-hidden="true" size={22} />
      </button>
      <span>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </span>
    </header>
  );
}

interface StartDayFlowProps {
  accountId: string;
  crews: readonly TrackBCrewOption[];
  currentDate: string;
  existingSessions: readonly DaySession[];
  idFactory: () => string;
  now: () => string;
  onCancel: () => void;
  onImportWork: () => void;
  onStarted: (
    session: DaySession,
    event: DaySessionEvent,
  ) => boolean | Promise<boolean>;
  prefill?: StartDayPrefill;
  propertyName: string;
  propertyId: string;
  propertyRoster: PropertyRoster;
  releases: readonly DailyReleaseBatch[];
  startedBy: string;
}

export interface StartDayPrefill {
  readonly activeCrewIdsByTrade?: Readonly<Record<TrackBTrade, readonly string[]>>;
  readonly propertyContact?: string;
  readonly walkthroughScheduleWording?: string;
  readonly workingHoursWording?: string;
}

export function StartDayFlow({
  accountId,
  crews,
  currentDate,
  existingSessions,
  idFactory,
  now,
  onCancel,
  onImportWork,
  onStarted,
  prefill,
  propertyId,
  propertyName,
  propertyRoster,
  releases,
  startedBy,
}: StartDayFlowProps) {
  const confirmedReleases = useMemo(() => releases.filter((release) => (
    release.propertyId === propertyId
    && release.date === currentDate
    && release.confirmationStatus === 'confirmed'
    && Boolean(release.confirmedAt)
    && Boolean(release.confirmedBy)
  )), [currentDate, propertyId, releases]);
  const releaseProjection = useMemo(() => {
    try {
      return {
        error: '',
        task: createTodayTask(propertyRoster, confirmedReleases, currentDate),
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Release validation failed.',
        task: null,
      };
    }
  }, [confirmedReleases, currentDate, propertyRoster]);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [warnings, setWarnings] = useState<readonly string[]>([]);
  const [saving, setSaving] = useState(false);
  const [persistenceFailed, setPersistenceFailed] = useState(false);
  const startInFlight = useRef(false);
  const [review, setReview] = useState<StartDayReview>(() => ({
    accountId,
    activeCrewIdsByTrade: {
      Clean: [...(
        prefill?.activeCrewIdsByTrade?.Clean
        ?? crews.filter((crew) => crew.activeToday && crew.trade === 'Clean').map((crew) => crew.id)
      )],
      Paint: [...(
        prefill?.activeCrewIdsByTrade?.Paint
        ?? crews.filter((crew) => crew.activeToday && crew.trade === 'Paint').map((crew) => crew.id)
      )],
    },
    assignmentEvidenceReviewNote: '',
    crewReviewConfirmed: { Clean: false, Paint: false },
    date: currentDate,
    daySessionId: idFactory(),
    explicitConfirmation: false,
    goal: releaseProjection.task
      ? createTodayTaskGoal(releaseProjection.task)
      : {
          metric: 'sections',
          milestone: 'los-inspected',
          scope: 'today-confirmed-release',
          target: 0,
        },
    keyStatus: 'yes',
    morningNote: '',
    propertyContact: prefill?.propertyContact ?? confirmedReleases[0]?.propertyContact ?? '',
    propertyId,
    releaseBatchIds: confirmedReleases.map((release) => release.id),
    startedBy,
    walkthroughScheduleWording: prefill?.walkthroughScheduleWording ?? '',
    workingHoursWording: prefill?.workingHoursWording ?? '',
  }));

  const currentTitle = START_DAY_STEPS[step];
  const canContinue = (
    (step !== 1 || review.propertyContact.trim().length > 0)
    && (step !== 3 || (
      Boolean(releaseProjection.task)
      && review.assignmentEvidenceReviewNote.trim().length > 0
    ))
    && (step !== 5 || (
      review.workingHoursWording.trim().length > 0
      && review.walkthroughScheduleWording.trim().length > 0
    ))
  );

  const toggleCrew = (trade: TrackBTrade, crewId: string) => {
    setReview((current) => {
      const currentIds = current.activeCrewIdsByTrade[trade];
      return {
        ...current,
        activeCrewIdsByTrade: {
          ...current.activeCrewIdsByTrade,
          [trade]: currentIds.includes(crewId)
            ? currentIds.filter((id) => id !== crewId)
            : [...currentIds, crewId],
        },
      };
    });
  };
  const selectedCrewNames = (trade: TrackBTrade) => (
    review.activeCrewIdsByTrade[trade].map((crewId) => (
      crews.find((crew) => crew.id === crewId)?.name ?? `Unknown crew (${crewId})`
    ))
  );

  const continueFlow = () => {
    if (!canContinue) return;
    if (step === 4) {
      setReview((current) => ({
        ...current,
        crewReviewConfirmed: { Clean: true, Paint: true },
      }));
    }
    setStep((current) => Math.min(START_DAY_STEPS.length - 1, current + 1));
  };

  const start = async () => {
    if (startInFlight.current) return;
    const result = startDaySession(review, releases, propertyRoster, existingSessions, now());
    setErrors(result.errors);
    setWarnings(result.warnings);
    if (!result.session || !result.startEvent) return;

    startInFlight.current = true;
    setSaving(true);
    setPersistenceFailed(false);
    try {
      const persisted = await onStarted(result.session, result.startEvent);
      if (!persisted) {
        setPersistenceFailed(true);
        setErrors([
          'Start Day was not saved. Nothing was started or added to Activity. Retry, edit the review, or cancel.',
        ]);
      }
    } catch {
      setPersistenceFailed(true);
      setErrors([
        'Start Day could not be saved. Nothing was started or added to Activity. Retry, edit the review, or cancel.',
      ]);
    } finally {
      startInFlight.current = false;
      setSaving(false);
    }
  };

  const stepBody = (() => {
    if (step === 0) {
      return (
        <section className="w2a2b-review-card">
          <span className="w2a2b-eyebrow">Personal workspace</span>
          <h2>{propertyName}</h2>
          <p>Confirm this is the project and field date you are supporting.</p>
          <dl>
            <div><dt>Field date</dt><dd>{review.date}</dd></div>
          </dl>
          <p>A date change never silently creates another Day Session.</p>
        </section>
      );
    }
    if (step === 1) {
      return (
        <label className="w2a2b-field">
          <span>Property contact</span>
          <input
            autoComplete="off"
            onChange={(event) => {
              const { value } = event.currentTarget;
              setReview((current) => ({ ...current, propertyContact: value }));
            }}
            value={review.propertyContact}
          />
          <small>Record the person Los expects to coordinate with today.</small>
        </label>
      );
    }
    if (step === 2) {
      return (
        <fieldset className="w2a2b-choice-group">
          <legend>Keys and access</legend>
          {(['yes', 'no', 'partial-issue'] as const).map((status) => (
            <label key={status}>
              <input
                checked={review.keyStatus === status}
                name="start-key-status"
                onChange={() => setReview((current) => ({ ...current, keyStatus: status }))}
                type="radio"
              />
              <span><strong>{keyStatusLabel[status]}</strong></span>
            </label>
          ))}
          <p className="w2a2b-safety-note">
            Keys describe access. They do not release or authorize work.
          </p>
        </fieldset>
      );
    }
    if (step === 3) {
      return confirmedReleases.length > 0 ? (
        <div className="w2a2b-field-stack">
          <section className="w2a2b-review-card">
            <span className="w2a2b-eyebrow">Confirmed release evidence</span>
            <h2>{confirmedReleases.length} confirmed {confirmedReleases.length === 1 ? 'batch' : 'batches'}</h2>
            <p>
              {releaseProjection.task?.sections.length ?? 0}
              {' '}released physical sections will form Today’s Task.
            </p>
            <p>
              Goal: {review.goal.target} sections · Los inspected · today-confirmed-release
            </p>
            {confirmedReleases.map((release) => (
              <p className="w2a2b-source-reference" key={release.id}>
                Source: {release.originalSourceReference ?? 'No source reference recorded'}
              </p>
            ))}
            <p className="w2a2b-boundary-copy">
              Roster membership alone does not enter Today’s Task.
            </p>
            {releaseProjection.error ? (
              <p className="w2a2b-inline-error" role="alert">{releaseProjection.error}</p>
            ) : null}
          </section>
          <label className="w2a2b-field">
            <span>Assignment evidence / review note</span>
            <textarea
              onChange={(event) => {
                const { value } = event.currentTarget;
                setReview((current) => ({ ...current, assignmentEvidenceReviewNote: value }));
              }}
              placeholder="Record what Los reviewed; this does not create or edit an assignment"
              rows={4}
              value={review.assignmentEvidenceReviewNote}
            />
            <small>Personal evidence note only. No assignment is created or changed.</small>
          </label>
        </div>
      ) : (
        <button
          className="w2a2b-empty-card w2a2b-empty-card--button"
          data-track-b-critical-target="true"
          onClick={onImportWork}
          type="button"
        >
          <FileUp aria-hidden="true" size={24} />
          <span>
            <strong>Import today’s released work</strong>
            <small>No explicitly confirmed release exists for this project and date.</small>
          </span>
          <ChevronRight aria-hidden="true" size={19} />
        </button>
      );
    }
    if (step === 4) {
      return (
        <div className="w2a2b-field-stack">
          {(['Paint', 'Clean'] as const).map((trade) => {
            const options = crews.filter((crew) => crew.trade === trade);
            return (
              <fieldset className="w2a2b-choice-group" key={trade}>
                <legend>Active {trade} crews</legend>
                {options.length > 0 ? options.map((crew) => (
                  <label key={crew.id}>
                    <input
                      checked={review.activeCrewIdsByTrade[trade].includes(crew.id)}
                      onChange={() => toggleCrew(trade, crew.id)}
                      type="checkbox"
                    />
                    <span>
                      <strong>{crew.name}</strong>
                      <small>
                        {crew.activeToday ? 'Marked active today' : 'Available but not active'}
                      </small>
                    </span>
                  </label>
                )) : (
                  <p>No {trade} crews are recorded. Confirming none is allowed.</p>
                )}
              </fieldset>
            );
          })}
        </div>
      );
    }
    if (step === 5) {
      return (
        <div className="w2a2b-field-stack">
          <label className="w2a2b-field">
            <span>Exact working-hours wording</span>
            <textarea
              onChange={(event) => {
                const { value } = event.currentTarget;
                setReview((current) => ({ ...current, workingHoursWording: value }));
              }}
              placeholder="Preserve the property’s wording exactly"
              rows={3}
              value={review.workingHoursWording}
            />
          </label>
          <label className="w2a2b-field">
            <span>Walkthrough schedule wording</span>
            <textarea
              onChange={(event) => {
                const { value } = event.currentTarget;
                setReview((current) => ({ ...current, walkthroughScheduleWording: value }));
              }}
              placeholder="Preserve the agreed schedule wording exactly"
              rows={3}
              value={review.walkthroughScheduleWording}
            />
          </label>
        </div>
      );
    }
    if (step === 6) {
      return (
        <label className="w2a2b-field">
          <span>Morning note <small>Optional</small></span>
          <textarea
            onChange={(event) => {
              const { value } = event.currentTarget;
              setReview((current) => ({ ...current, morningNote: value }));
            }}
            placeholder="Personal reminder for this Day Session"
            rows={5}
            value={review.morningNote}
          />
        </label>
      );
    }
    if (step === 7) {
      return (
        <div className="w2a2b-field-stack">
          <section className="w2a2b-review-list" aria-label="Start Day review">
            <dl>
              <div><dt>Project</dt><dd>{propertyName}</dd></div>
              <div><dt>Date</dt><dd>{review.date}</dd></div>
              <div><dt>Contact</dt><dd>{review.propertyContact}</dd></div>
              <div><dt>Keys and access</dt><dd>{keyStatusLabel[review.keyStatus]}</dd></div>
              <div><dt>Confirmed releases</dt><dd>{review.releaseBatchIds.length}</dd></div>
              <div>
                <dt>Assignment evidence / review note</dt>
                <dd>{review.assignmentEvidenceReviewNote}</dd>
              </div>
              <div><dt>Exact working-hours wording</dt><dd>{review.workingHoursWording}</dd></div>
              <div>
                <dt>Walkthrough schedule wording</dt>
                <dd>{review.walkthroughScheduleWording}</dd>
              </div>
              <div>
                <dt>Morning note</dt>
                <dd>{review.morningNote?.trim() || 'None recorded'}</dd>
              </div>
              <div><dt>Goal target</dt><dd>{review.goal.target} physical sections</dd></div>
              <div>
                <dt>Paint crews</dt>
                <dd>{selectedCrewNames('Paint').join(', ') || 'None selected'}</dd>
              </div>
              <div>
                <dt>Clean crews</dt>
                <dd>{selectedCrewNames('Clean').join(', ') || 'None selected'}</dd>
              </div>
            </dl>
          </section>
          <section className="w2a2b-confirm-card">
            <CheckCircle2 aria-hidden="true" size={28} />
            <h2>Start this personal Day Session?</h2>
            <p>
              Today’s Task will use only the explicitly confirmed release. This does not update
              paper, property, approval, or payroll records.
            </p>
            <label>
              <input
                checked={review.explicitConfirmation}
                onChange={(event) => {
                  const { checked } = event.currentTarget;
                  setReview((current) => ({ ...current, explicitConfirmation: checked }));
                }}
                type="checkbox"
              />
              <span>I reviewed the Start Day details.</span>
            </label>
          </section>
        </div>
      );
    }
    return null;
  })();

  return (
    <section className="w2a2b-flow-page" data-testid="track-b-start-day">
      <PageHeader onBack={step === 0 ? onCancel : () => setStep((current) => current - 1)} title="Start Day" />
      <div className="w2a2b-step-meta" aria-live="polite">
        <span>Step {step + 1} of {START_DAY_STEPS.length}</span>
        <strong>{currentTitle}</strong>
      </div>
      <div className="w2a2b-step-progress" aria-hidden="true">
        <span style={{ width: `${((step + 1) / START_DAY_STEPS.length) * 100}%` }} />
      </div>
      <div className="w2a2b-flow-body">{stepBody}</div>
      {errors.length > 0 ? (
        <div className="w2a2b-message is-error" role="alert">
          {errors.map((error) => <p key={error}>{error}</p>)}
        </div>
      ) : null}
      {warnings.length > 0 ? (
        <div className="w2a2b-message is-warning" role="status">
          {warnings.map((warning) => <p key={warning}>{warning}</p>)}
        </div>
      ) : null}
      <footer className="w2a2b-flow-actions">
        {step < START_DAY_STEPS.length - 1 ? (
          <button
            className="w2a2b-primary-button"
            data-track-b-critical-target="true"
            disabled={!canContinue}
            onClick={continueFlow}
            type="button"
          >
            Continue
          </button>
        ) : (
          <>
            {persistenceFailed ? (
              <>
                <button
                  data-track-b-critical-target="true"
                  onClick={() => setStep(6)}
                  type="button"
                >
                  Edit review
                </button>
                <button
                  data-track-b-critical-target="true"
                  onClick={onCancel}
                  type="button"
                >
                  Cancel
                </button>
              </>
            ) : null}
            <button
              className="w2a2b-primary-button"
              data-track-b-critical-target="true"
              disabled={!review.explicitConfirmation || saving}
              onClick={() => void start()}
              type="button"
            >
              {saving ? 'Saving Day Session…' : persistenceFailed ? 'Retry Start Day' : 'Start Day'}
            </button>
          </>
        )}
      </footer>
    </section>
  );
}

// The closing page: after Close Day Session, land here so the nightly ritual
// (report PDF + backup export) can never be missed on the way out.
function DayClosedPage({
  acceptedToday = [],
  acceptedWalkMeta,
  currentDate,
  onDone,
  onExportBackup,
  onExportReport,
}: {
  acceptedToday?: readonly {
    trades: readonly string[];
    unitId: string;
    unitNumber: string;
  }[];
  acceptedWalkMeta?: Readonly<Record<string, { at?: string; contact: string }>>;
  currentDate: string;
  onDone: () => void;
  onExportBackup?: () => Promise<string>;
  onExportReport?: (dayNumber?: number) => Promise<string>;
}) {
  const [status, setStatus] = useState('');
  const run = (task?: () => Promise<string>) => {
    if (!task) return;
    setStatus('Working…');
    void task()
      .then(setStatus)
      .catch(() => setStatus('That could not be completed. Try again.'));
  };
  return (
    <div className="w2a2b-workspace w2a2b-day-closed">
      <PageHeader onBack={onDone} title="Day closed" />
      <section className="w2a2b-review-card">
        <span className="w2a2b-eyebrow">{currentDate}</span>
        <h2>The day is closed. Two taps and tonight is safe.</h2>
        {acceptedToday.length > 0 ? (
          <div className="w2a2b-done-list">
            <small>Accepted today</small>
            {acceptedToday.map((unit) => {
              const meta = acceptedWalkMeta?.[unit.unitId];
              return (
                <div key={unit.unitId} className="w2a2b-endday-accepted__row">
                  <strong>Unit {unit.unitNumber}</strong>
                  <span>
                    {unit.trades
                      .map((trade) => trade.charAt(0).toUpperCase() + trade.slice(1))
                      .join(' + ')} approved
                    {meta ? ` · walked with ${meta.contact}` : ''}
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}
      </section>
      <section className="w2a2b-section" aria-label="Nightly ritual">
        <div className="w2a2b-inset-list">
          {onExportReport ? (
            <button
              data-track-b-critical-target="true"
              onClick={() => run(() => onExportReport())}
              type="button"
            >
              <span className="w2a2b-row-icon is-needs-inspection"><ClipboardList aria-hidden="true" size={20} /></span>
              <span>
                <strong>Save today’s report (PDF)</strong>
                <small>The one-page day report for Rey, Tony, or the property.</small>
              </span>
              <ChevronRight aria-hidden="true" size={19} />
            </button>
          ) : null}
          {onExportBackup ? (
            <button
              data-track-b-critical-target="true"
              onClick={() => run(onExportBackup)}
              type="button"
            >
              <span className="w2a2b-row-icon is-working"><FileUp aria-hidden="true" size={20} /></span>
              <span>
                <strong>Export tonight’s backup</strong>
                <small>Save the file to iCloud Drive — that’s your off-phone copy.</small>
              </span>
              <ChevronRight aria-hidden="true" size={19} />
            </button>
          ) : null}
        </div>
        {status ? (
          <p aria-live="polite" className="w2a2b-ritual__status">{status}</p>
        ) : null}
      </section>
      <button className="w2a2b-primary-button" onClick={onDone} type="button">
        Done — back to Home
      </button>
    </div>
  );
}

interface EndDayFlowProps {
  activeWalkSessionId?: string;
  acceptedToday?: readonly {
    trades: readonly string[];
    unitId: string;
    unitNumber: string;
  }[];
  acceptedWalkMeta?: Readonly<Record<string, { at?: string; contact: string }>>;
  events: readonly DaySessionEvent[];
  now: () => string;
  onCancel: () => void;
  onClosed: (
    session: DaySession,
    event: DaySessionEvent,
  ) => boolean | Promise<boolean> | void;
  onOpenActiveWalk?: (
    walkSessionId: string,
    intent: 'return' | 'end',
  ) => void;
  recordedBy: string;
  session: DaySession;
  task: TodayTask | null;
}

export function EndDayFlow({
  activeWalkSessionId,
  acceptedToday = [],
  acceptedWalkMeta,
  events,
  now,
  onCancel,
  onClosed,
  onOpenActiveWalk,
  recordedBy,
  session,
  task,
}: EndDayFlowProps) {
  const summary = useMemo(
    () => buildEndDaySummary(task, events, session),
    [events, session, task],
  );
  const [review, setReview] = useState<EndDayReview>({
    endKeyStatus: undefined,
    endNote: '',
    explicitConfirmation: false,
    propertyCheckIn: '',
    propertyReviewStatus: 'not-reviewed',
  });
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [warnings, setWarnings] = useState<readonly string[]>(
    summary.unresolvedSectionTradeIds.length > 0
      ? [`${summary.unresolvedSectionTradeIds.length} released Paint and Clean sections remain unresolved.`]
      : [],
  );
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const readyToWalkPackages = getTodayTaskQueueCounts(task)['ready-to-walk'];

  const finish = async () => {
    if (savingRef.current) return;
    if (activeWalkSessionId) {
      setErrors(['Finish or defer the active property walk before ending the day.']);
      return;
    }
    const result = closeDaySession(
      markDaySessionEnding(session),
      review,
      summary,
      now(),
      recordedBy,
    );
    setErrors(result.errors);
    setWarnings(result.warnings);
    if (!result.session || !result.closeEvent) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const persisted = await onClosed(result.session, result.closeEvent);
      if (persisted === false) {
        setErrors([
          'The Day Session was not durably saved. Keep this screen open and retry.',
        ]);
        savingRef.current = false;
        setSaving(false);
      }
    } catch {
      setErrors([
        'The Day Session was not durably saved. Keep this screen open and retry.',
      ]);
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <section className="w2a2b-flow-page" data-testid="track-b-end-day">
      <PageHeader onBack={onCancel} title="End Day" />
      {activeWalkSessionId ? (
        <section className="w2a2b-message is-error" role="alert">
          <p>Finish or defer the active property walk before ending the day.</p>
          <div className="w2a2b-flow-actions">
            <button
              onClick={() => onOpenActiveWalk?.(activeWalkSessionId, 'return')}
              type="button"
            >
              Return to Active Walk
            </button>
            <button
              onClick={() => onOpenActiveWalk?.(activeWalkSessionId, 'end')}
              type="button"
            >
              End Walk
            </button>
            <button onClick={onCancel} type="button">Cancel End Day</button>
          </div>
        </section>
      ) : null}
      {readyToWalkPackages > 0 && !activeWalkSessionId ? (
        <section className="w2a2b-message is-warning" role="status">
          <p>
            {readyToWalkPackages} Unit+Trade package{readyToWalkPackages === 1 ? ' is' : 's are'} still
            Ready to Walk. Walk {readyToWalkPackages === 1 ? 'it' : 'them'} with the property
            before closing if you can — otherwise {readyToWalkPackages === 1 ? 'it' : 'they'} carry to tomorrow.
          </p>
        </section>
      ) : null}
      <section className="w2a2b-review-card">
        <span className="w2a2b-eyebrow">Day summary</span>
        <h2>
          {(() => {
            const sections = task?.sections ?? [];
            if (sections.length === 0) {
              return `${summary.releasedToday} released Paint and Clean sections`;
            }
            const tradeLine = (['Paint', 'Clean'] as const).flatMap((trade) => {
              const released = new Set(sections
                .filter((section) => section.tradeStates.some((state) => state.trade === trade))
                .map((section) => section.unitId)).size;
              if (released === 0) return [];
              const done = acceptedToday.filter((unit) => unit.trades.includes(trade)).length;
              return [`${trade} ${done}/${released}`];
            }).join(' · ');
            const commons = sections.filter((section) => section.sectionId === 'common').length;
            const beds = sections.length - commons;
            return `${tradeLine} units · ${beds} bed${beds === 1 ? '' : 's'} · ${commons} common`;
          })()}
        </h2>
        <p className="w2a2b-grain-copy">
          Counts cover Paint and Clean. Notes and photos count events.
        </p>
        <details className="w2a2b-summary-details">
          <summary>Full counts</summary>
          <div className="w2a2b-summary-grid">
            {(Object.keys(END_DAY_SUMMARY_LABELS) as (keyof typeof END_DAY_SUMMARY_LABELS)[]).map((key) => (
              <div key={key}>
                <span>{END_DAY_SUMMARY_LABELS[key]}</span>
                <strong>{summary[key]}</strong>
              </div>
            ))}
          </div>
        </details>
        {acceptedToday.length > 0 ? (
          <div className="w2a2b-done-list w2a2b-endday-accepted">
            <small>Units the property accepted today</small>
            {acceptedToday.map((unit) => {
              const meta = acceptedWalkMeta?.[unit.unitId];
              return (
                <div key={unit.unitId} className="w2a2b-endday-accepted__row">
                  <strong>Unit {unit.unitNumber}</strong>
                  <span>
                    {unit.trades
                      .map((trade) => trade.charAt(0).toUpperCase() + trade.slice(1))
                      .join(' + ')} approved
                    {meta ? ` · walked with ${meta.contact}` : ''}
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}
      </section>

      {summary.unresolvedSectionTradeIds.length > 0 ? (
        <section className="w2a2b-unresolved-card">
          <AlertTriangle aria-hidden="true" size={22} />
          <span>
            <strong>Unresolved work stays unresolved</strong>
            <small>
              You may close the personal day, but {summary.unresolvedSectionTradeIds.length}
              {' '}released Paint and Clean sections still need follow-up.
            </small>
          </span>
        </section>
      ) : null}

      <fieldset className="w2a2b-choice-group w2a2b-choice-group--inline">
        <legend>Clipboard / wall-board review</legend>
        {(['reviewed', 'not-reviewed'] as const).map((status) => (
          <label key={status}>
            <input
              checked={review.propertyReviewStatus === status}
              name="paper-review"
              onChange={() => setReview((current) => ({ ...current, propertyReviewStatus: status }))}
              type="radio"
            />
            <span><strong>{status === 'reviewed' ? 'Reviewed' : 'Not reviewed'}</strong></span>
          </label>
        ))}
      </fieldset>

      <fieldset className="w2a2b-choice-group w2a2b-choice-group--inline">
        <legend>End Day key / access status</legend>
        <p className="w2a2b-safety-note">
          Opening observation: {keyStatusLabel[session.keyStatus]}. This End Day field is separate.
        </p>
        {(['yes', 'no', 'partial-issue'] as const).map((status) => (
          <label key={status}>
            <input
              checked={review.endKeyStatus === status}
              name="end-key-status"
              onChange={() => setReview((current) => ({ ...current, endKeyStatus: status }))}
              type="radio"
            />
            <span><strong>{keyStatusLabel[status]}</strong></span>
          </label>
        ))}
      </fieldset>

      <details className="w2a2b-summary-details">
      <summary>Notes (optional)</summary>
      <label className="w2a2b-field">
        <span>End-of-day property check-in <small>Optional</small></span>
        <input
          onChange={(event) => {
            const { value } = event.currentTarget;
            setReview((current) => ({ ...current, propertyCheckIn: value }));
          }}
          value={review.propertyCheckIn}
        />
      </label>
      <label className="w2a2b-field">
        <span>End note <small>Optional</small></span>
        <textarea
          onChange={(event) => {
            const { value } = event.currentTarget;
            setReview((current) => ({ ...current, endNote: value }));
          }}
          rows={4}
          value={review.endNote}
        />
      </label>
      </details>
      <label className="w2a2b-explicit-confirm">
        <input
          checked={review.explicitConfirmation}
          onChange={(event) => {
            const { checked } = event.currentTarget;
            setReview((current) => ({ ...current, explicitConfirmation: checked }));
          }}
          type="checkbox"
        />
        <span>I reviewed the summary and want to close this personal Day Session.</span>
      </label>

      {errors.length > 0 ? (
        <div className="w2a2b-message is-error" role="alert">
          {errors.map((error) => <p key={error}>{error}</p>)}
        </div>
      ) : null}
      {warnings.length > 0 ? (
        <div className="w2a2b-message is-warning" role="status">
          {warnings.map((warning) => <p key={warning}>{warning}</p>)}
        </div>
      ) : null}

      <footer className="w2a2b-flow-actions">
        {!review.explicitConfirmation && !activeWalkSessionId ? (
          <p className="w2a2b-footer-hint">
            Check the confirmation above to close the day.
          </p>
        ) : null}
        <button
          className="w2a2b-primary-button"
          data-track-b-critical-target="true"
          disabled={Boolean(activeWalkSessionId) || !review.explicitConfirmation || saving}
          onClick={() => void finish()}
          type="button"
        >
          {saving ? 'Saving Day Session…' : 'Close Day Session'}
        </button>
      </footer>
    </section>
  );
}

export interface HomeCrewNowLine {
  id: string;
  name: string;
  trade: 'paint' | 'clean';
  units: string[];
}

export interface HomeGlance {
  released: number;
  working: number;
  approved: number;
}

interface DayTaskHomeProps {
  crewsNow?: readonly HomeCrewNowLine[];
  glance?: HomeGlance;
  onOpenCrew?: (crewId: string) => void;
  currentDate: string;
  onAction: (action: 'import-work' | 'assign-crews' | 'start-walk') => void;
  onEndDay: () => void;
  onOpenQueue: (queue: TodayTaskQueue) => void;
  onOpenTaskDetail?: () => void;
  onStartDay: () => void;
  propertyName: string;
  rosterCount: number;
  scopeErrors: readonly string[];
  session?: DaySession;
  task: TodayTask | null;
  queueCounts?: Readonly<Record<TodayTaskQueueId, number>>;
  acceptedToday?: readonly {
    trades: readonly string[];
    unitId: string;
    unitNumber: string;
  }[];
  acceptedWalkMeta?: Readonly<Record<string, { at?: string; contact: string }>>;
  dayNumber?: number;
  onExportBackup?: () => Promise<string>;
  onExportReport?: (dayNumber?: number) => Promise<string>;
  onOpenUnit?: (unitId: string) => void;
}

function DayTaskHome({
  acceptedToday = [],
  acceptedWalkMeta,
  currentDate,
  dayNumber,
  onExportBackup,
  onExportReport,
  onOpenUnit,
  onAction,
  onEndDay,
  onOpenQueue,
  onOpenTaskDetail,
  onStartDay,
  propertyName,
  rosterCount,
  crewsNow,
  glance,
  onOpenCrew,
  scopeErrors,
  session,
  task,
  queueCounts,
}: DayTaskHomeProps) {
  const counts = queueCounts ?? getTodayTaskQueueCounts(task);
  const progress = calculateTodayTaskProgress(task);
  const active = isOpenDay(session);
  const [ritualStatus, setRitualStatus] = useState('');
  // Done-today can grow to dozens of units; keep it collapsed to a tappable
  // summary so it never stacks up and buries the rest of Home.
  const [doneExpanded, setDoneExpanded] = useState(false);
  const summaryText = () => {
    const doneLine = acceptedToday.length > 0
      ? `${acceptedToday.length} unit${acceptedToday.length === 1 ? '' : 's'} done — ${
          acceptedToday.map((unit) => {
            const meta = acceptedWalkMeta?.[unit.unitId];
            return `${unit.unitNumber} (${unit.trades.join(' + ')})${
              meta ? ` with ${meta.contact}` : ''}`;
          }).join(', ')}. `
      : '';
    return `${propertyName} Day ${dayNumber ?? ''}: ${doneLine}`
      + `${progress.actual}/${progress.target} sections passed. `
      + `${counts.callbacks} callback${counts.callbacks === 1 ? '' : 's'} open, `
      + `${counts['ready-to-walk']} ready to walk.`;
  };
  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(summaryText());
      setRitualStatus('Day update copied — paste it to Tony or Joseph.');
    } catch {
      setRitualStatus(summaryText());
    }
  };
  const exportBackup = async () => {
    if (!onExportBackup) return;
    setRitualStatus('Building the backup file…');
    try {
      setRitualStatus(await onExportBackup());
    } catch {
      setRitualStatus('The backup could not be built. Try again from More → Backup.');
    }
  };
  const exportReport = async () => {
    if (!onExportReport) return;
    setRitualStatus('Building today’s report…');
    try {
      setRitualStatus(await onExportReport(dayNumber));
    } catch {
      setRitualStatus('The report could not be built. The backup still has every record.');
    }
  };

  return (
    <section className="w2a2b-home" data-testid="track-b-home">
      <header className="w2a2b-home-header w2a2b-home-header--compact">
        <h1>Home</h1>
        {task ? (() => {
          // Per-trade "done today" — paint releases first, cleans follow, so a
          // unit-grain count would hide a finished clean day behind open paint.
          const badgeLines = (['Paint', 'Clean'] as const).flatMap((trade) => {
            const released = new Set(task.sections
              .filter((section) => section.tradeStates.some((state) => state.trade === trade))
              .map((section) => section.unitId)).size;
            if (released === 0) return [];
            const done = acceptedToday
              .filter((unit) => unit.trades.includes(trade)).length;
            return [`${trade} ${done}/${released}`];
          });
          return badgeLines.length > 0 ? (
            <span aria-label="Units done today of units released today, by trade" className="w2a2b-day-badge">
              {badgeLines.join(' · ')}
            </span>
          ) : null;
        })() : null}
        {(() => {
          // A new calendar day means a NEW day number — never show yesterday's
          // "Day 1" on Sunday morning.
          const openToday = Boolean(session
            && session.date === currentDate && session.status !== 'closed');
          if (!openToday) {
            return (
              <p className="w2a2b-day-brief">
                Day {(dayNumber ?? 0) + 1} · not started — tap Start Day
                {counts.callbacks > 0
                  ? ` · ${counts.callbacks} callback${counts.callbacks === 1 ? '' : 's'} carried over`
                  : ''}
              </p>
            );
          }
          return dayNumber ? (
            <p className="w2a2b-day-brief">
              Day {dayNumber}
              {counts.callbacks > 0
                ? ` · ${counts.callbacks} callback${counts.callbacks === 1 ? '' : 's'} open`
                : ''}
              {counts['ready-to-walk'] > 0
                ? ` · ${counts['ready-to-walk']} ready to walk`
                : ''}
              {counts.callbacks === 0 && counts['ready-to-walk'] === 0
                ? ' · nothing carried over'
                : ''}
            </p>
          ) : null;
        })()}
        {glance ? (
          <p className="w2a2b-glance-line">
            {rosterCount} in roster · {glance.released} released · {glance.working} working · {glance.approved} approved
          </p>
        ) : null}
      </header>

      <section className="w2a2b-day-status" aria-labelledby="w2a2b-day-status-title">
        <span className={`w2a2b-day-status__icon is-${session?.status ?? 'not-started'}`}>
          {active ? <CheckCircle2 aria-hidden="true" size={22} /> : <Play aria-hidden="true" size={22} />}
        </span>
        <span>
          <small id="w2a2b-day-status-title">Day Session</small>
          <strong>{active ? 'Active' : session?.status === 'closed' ? 'Closed' : 'Not started'}</strong>
          <em>
            {active
              ? session?.startedAt
                ? `Start recorded · ${formatSessionTime(session.startedAt)}`
                : 'Start time not recorded'
              : 'Start with explicit review'}
          </em>
        </span>
        {!active && session?.status !== 'closed' ? (
          <button
            data-track-b-critical-target="true"
            onClick={onStartDay}
            type="button"
          >
            Start Day
          </button>
        ) : null}
      </section>

      {crewsNow && crewsNow.length > 0 ? (
        <section className="w2a2b-section" aria-labelledby="w2a2b-crews-now-title">
          <div className="w2a2b-section-heading">
            <h2 id="w2a2b-crews-now-title">Crews right now</h2>
          </div>
          <div className="w2a2b-inset-list">
            {crewsNow.map((crew) => (
              <button
                data-track-b-critical-target="true"
                key={crew.id}
                onClick={() => onOpenCrew?.(crew.id)}
                type="button"
              >
                <span className={`w2a2b-row-icon is-crew-${crew.trade}`}>
                  {crew.trade === 'paint'
                    ? <Paintbrush aria-hidden="true" size={20} />
                    : <Droplets aria-hidden="true" size={20} />}
                </span>
                <span>
                  <strong>{crew.name}</strong>
                  <small>
                    {crew.trade === 'paint' ? 'Paint' : 'Clean'}
                    {crew.units.length > 0
                      ? ` — ${crew.units.join(', ')}`
                      : ' — no units yet today'}
                  </small>
                </span>
                <ChevronRight aria-hidden="true" size={19} />
              </button>
            ))}
          </div>
        </section>
      ) : null}
      <section className="w2a2b-section" aria-labelledby="w2a2b-current-title">
        <div className="w2a2b-section-heading">
          <h2 id="w2a2b-current-title">Current work</h2>
        </div>
        {active && counts['ready-to-walk'] >= 4 ? (
          <button
            className="w2a2b-walk-banner"
            data-track-b-critical-target="true"
            onClick={() => onAction('start-walk')}
            type="button"
          >
            <strong>{counts['ready-to-walk']} ready to walk</strong>
            <span>Worth grabbing your property contact — start the walk</span>
            <ChevronRight aria-hidden="true" size={18} />
          </button>
        ) : null}
        <div className="w2a2b-inset-list">
          {queueOrder.map((queueId) => {
            const queue = selectTodayTaskQueue(task, queueId);
            return (
              <button
                data-track-b-critical-target="true"
                key={queueId}
                onClick={() => onOpenQueue(queue)}
                type="button"
              >
                <span className={`w2a2b-row-icon is-${queueId}`}>{queueIcons[queueId]}</span>
                <span><strong>{queue.label}</strong></span>
                <em>{counts[queueId]}</em>
                <ChevronRight aria-hidden="true" size={19} />
              </button>
            );
          })}
        </div>
      </section>

      <section className="w2a2b-section" aria-labelledby="w2a2b-actions-title">
        <div className="w2a2b-section-heading">
          <h2 id="w2a2b-actions-title">Field actions</h2>
        </div>
        <div className="w2a2b-inset-list">
          {[
            // Quick add covers Joseph's mid-day releases: it opens the tap
            // grid of roster units. Crews assign from the Crews tab — Field
            // actions stay lean: add, walk, close.
            ['import-work', 'Quick add units — new release from Joseph', <ClipboardList aria-hidden="true" size={20} />],
            ['start-walk', 'Start walk', <Footprints aria-hidden="true" size={20} />],
          ].map(([id, label, icon]) => (
            <button
              data-track-b-critical-target="true"
              key={id as string}
              onClick={() => onAction(id as 'import-work' | 'assign-crews' | 'start-walk')}
              type="button"
            >
              <span className="w2a2b-row-icon">{icon}</span>
              <span><strong>{label}</strong></span>
              <ChevronRight aria-hidden="true" size={19} />
            </button>
          ))}
          <button
            data-track-b-critical-target="true"
            disabled={!active}
            onClick={onEndDay}
            type="button"
          >
            <span className="w2a2b-row-icon"><LogOut aria-hidden="true" size={20} /></span>
            <span>
              <strong>End day</strong>
              {!active ? <small>Start a Day Session first</small> : null}
            </span>
            <ChevronRight aria-hidden="true" size={19} />
          </button>
        </div>
      </section>

      <section className="w2a2b-section" aria-labelledby="w2a2b-task-title">
        <div className="w2a2b-section-heading">
          <span>
            <small>{rosterCount} Units in property roster</small>
            <h2 id="w2a2b-task-title">Today’s Task</h2>
          </span>
          {task ? (
            <strong>
              {(() => {
                // Los and the property manager count in beds and common areas,
                // not raw "sections".
                const unitCount = new Set(task.sections.map((section) => section.unitId)).size;
                const commonCount = task.sections.filter((section) => section.sectionId === 'common').length;
                const bedCount = task.sections.length - commonCount;
                return [
                  `${unitCount} Unit${unitCount === 1 ? '' : 's'}`,
                  commonCount > 0 ? `${commonCount} common area${commonCount === 1 ? '' : 's'}` : '',
                  bedCount > 0 ? `${bedCount} bed${bedCount === 1 ? '' : 's'}` : '',
                ].filter(Boolean).join(' · ');
              })()}
            </strong>
          ) : null}
        </div>
        {scopeErrors.length > 0 ? (
          <div className="w2a2b-message is-error" role="alert">
            <p>Today’s Task was rejected because its release selection is not exact.</p>
            {scopeErrors.map((error) => <p key={error}>{error}</p>)}
          </div>
        ) : !task ? (
          <button
            className="w2a2b-empty-card w2a2b-empty-card--button"
            data-track-b-critical-target="true"
            onClick={() => onAction('import-work')}
            type="button"
          >
            <FileUp aria-hidden="true" size={24} />
            <span>
              <strong>Import today’s released work</strong>
              <small>Only an explicitly confirmed release becomes Today’s Task.</small>
            </span>
            <ChevronRight aria-hidden="true" size={19} />
          </button>
        ) : (
          <section className="w2a2b-progress-card">
            <div>
              <span>
                <small>Scope</small>
                <strong>{progress.scopeLabel}</strong>
              </span>
              <span>
                <small>Metric · Milestone</small>
                <strong>Units · Los inspected</strong>
              </span>
            </div>
            <p>{progress.copy}</p>
            <div
              aria-label={progress.copy}
              aria-valuemax={progress.target}
              aria-valuemin={0}
              aria-valuenow={progress.actual}
              className="w2a2b-progress"
              role="progressbar"
            >
              <span style={{ width: `${progress.percentage}%` }} />
            </div>
            <small>{progress.percentage}% of today’s confirmed release</small>
          </section>
        )}
      </section>

      {acceptedToday.length > 0 ? (
        <section className="w2a2b-section" aria-labelledby="w2a2b-done-title">
          <button
            aria-controls="w2a2b-done-list"
            aria-expanded={doneExpanded}
            className="w2a2b-section-heading w2a2b-done-toggle"
            onClick={() => setDoneExpanded((open) => !open)}
            type="button"
          >
            <span>
              <small>Property accepted with you on the walk</small>
              <h2 id="w2a2b-done-title">
                {(() => {
                  const tradeCounts = (['Paint', 'Clean'] as const)
                    .map((trade) => [trade, acceptedToday
                      .filter((unit) => unit.trades.includes(trade)).length] as const)
                    .filter(([, count]) => count > 0)
                    .map(([trade, count]) => `${count} ${trade}`)
                    .join(' · ');
                  return `Done today · ${acceptedToday.length} Unit${acceptedToday.length === 1 ? '' : 's'}${tradeCounts ? ` · ${tradeCounts}` : ''}`;
                })()}
              </h2>
            </span>
            <span aria-hidden="true" className="w2a2b-done-toggle__chevron">
              {doneExpanded ? 'Hide' : 'Show all'}
            </span>
          </button>
          {doneExpanded ? (
          <div className="w2a2b-inset-list w2a2b-done-list" id="w2a2b-done-list">
            {acceptedToday.map((unit) => {
              const meta = acceptedWalkMeta?.[unit.unitId];
              const body = (
                <>
                  <span className="w2a2b-done-list__unit">
                    <strong>Unit {unit.unitNumber}</strong>
                    {meta ? (
                      <small>
                        with {meta.contact}
                        {meta.at ? ` · ${new Intl.DateTimeFormat(undefined, {
                          hour: 'numeric',
                          minute: '2-digit',
                        }).format(new Date(meta.at))}` : ''}
                      </small>
                    ) : null}
                  </span>
                  <span>{unit.trades.map((trade) => `${trade} ✓`).join('  ')}</span>
                </>
              );
              return onOpenUnit ? (
                <button
                  data-track-b-critical-target="true"
                  key={unit.unitId}
                  onClick={() => onOpenUnit(unit.unitId)}
                  type="button"
                >
                  {body}
                </button>
              ) : (
                <div key={unit.unitId}>{body}</div>
              );
            })}
          </div>
          ) : null}
        </section>
      ) : null}

      <section className="w2a2b-section w2a2b-ritual" aria-label="Day update and backup">
        <div className="w2a2b-inset-list">
          <button
            data-track-b-critical-target="true"
            onClick={() => void copySummary()}
            type="button"
          >
            <span className="w2a2b-row-icon is-ready-to-walk"><ClipboardList aria-hidden="true" size={20} /></span>
            <span><strong>Copy day update</strong></span>
            <ChevronRight aria-hidden="true" size={19} />
          </button>
          {session?.status === 'closed' && onExportReport ? (
            <button
              data-track-b-critical-target="true"
              onClick={() => void exportReport()}
              type="button"
            >
              <span className="w2a2b-row-icon is-needs-inspection"><ClipboardList aria-hidden="true" size={20} /></span>
              <span>
                <strong>Save today’s report (PDF)</strong>
                <small>The one-page day report you can hand to Rey, Tony, or the property.</small>
              </span>
              <ChevronRight aria-hidden="true" size={19} />
            </button>
          ) : null}
          {session?.status === 'closed' && onExportBackup ? (
            <button
              data-track-b-critical-target="true"
              onClick={() => void exportBackup()}
              type="button"
            >
              <span className="w2a2b-row-icon is-working"><FileUp aria-hidden="true" size={20} /></span>
              <span>
                <strong>Export tonight’s backup</strong>
                <small>Save the file to iCloud Drive — that’s your off-phone copy.</small>
              </span>
              <ChevronRight aria-hidden="true" size={19} />
            </button>
          ) : null}
        </div>
        {ritualStatus ? (
          <p aria-live="polite" className="w2a2b-ritual__status">{ritualStatus}</p>
        ) : null}
      </section>

      <p className="w2a2b-paper-boundary">
        <ClipboardList aria-hidden="true" size={17} />
        Paper remains authoritative. These are Los&apos;s personal records.
      </p>
    </section>
  );
}

interface QueuePageProps {
  onBack: () => void;
  queue: TodayTaskQueue;
  onStartWalk?: () => void;
}

const queueTradeMatches = (
  queueId: TodayTaskQueueId,
  state: TodayTaskTradeState,
) => {
  if (queueId === 'needs-crew') return !state.assignedCrewId;
  if (queueId === 'needs-inspection') {
    return state.execution === 'crew-reported-complete'
      && !passedInspection(state.inspection);
  }
  if (queueId === 'ready-to-walk') {
    return passedInspection(state.inspection) && state.propertyWalk === 'pending';
  }
  if (queueId === 'working') return state.execution === 'working';
  return true;
};

function QueuePage({ onBack, onStartWalk, queue }: QueuePageProps) {
  // Los reads queues at Unit + Trade grain: one row per Unit and trade,
  // with the affected sections listed inside it.
  const packages = new Map<string, {
    sections: string[];
    trade: TodayTaskTradeState['trade'];
    unitNumber: string;
    unitType: string;
    waitingReasons: Set<string>;
  }>();
  for (const record of queue.records) {
    for (const state of record.tradeStates) {
      if (!queueTradeMatches(queue.id, state)) continue;
      const key = `${record.unitId}:${state.trade}`;
      const entry = packages.get(key) ?? {
        sections: [],
        trade: state.trade,
        unitNumber: record.unitNumber,
        unitType: record.unitType,
        waitingReasons: new Set<string>(),
      };
      entry.sections.push(record.sectionLabel);
      for (const reason of record.waitingReasons) entry.waitingReasons.add(reason);
      packages.set(key, entry);
    }
  }
  const rows = [...packages.entries()];
  return (
    <section className="w2a2b-flow-page" data-testid={`track-b-queue-${queue.id}`}>
      <PageHeader
        onBack={onBack}
        subtitle={`${rows.length} Unit+Trade ${rows.length === 1 ? 'job' : 'jobs'}`}
        title={queue.label}
      />
      {queue.id === 'ready-to-walk' && rows.length > 0 && onStartWalk ? (
        <button
          className="w2a2b-primary-button w2a2b-start-walk"
          data-track-b-critical-target="true"
          onClick={onStartWalk}
          type="button"
        >
          Start Walk with the property
        </button>
      ) : null}
      {rows.length === 0 ? (
        <section className="w2a2b-empty-card" role="status">
          {queueIcons[queue.id]}
          <h2>{queue.emptyMessage}</h2>
          <p>The count is zero, so no unrelated roster Units are shown.</p>
        </section>
      ) : (
        <div className="w2a2b-record-list">
          {rows.map(([key, entry]) => (
            <article key={key}>
              <span>
                <strong>Unit {entry.unitNumber} · {entry.trade}</strong>
                <small>{entry.sections.join(', ')} · {entry.unitType}</small>
              </span>
              <span className="w2a2b-trade-pills">
                <em>
                  {entry.trade === 'Paint'
                    ? <Paintbrush aria-hidden="true" size={14} />
                    : <Sparkles aria-hidden="true" size={14} />}
                  {entry.trade}
                </em>
              </span>
              {[...entry.waitingReasons].map((reason) => <p key={reason}>{reason}</p>)}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

interface RecoveryPageProps {
  currentDate: string;
  now: () => string;
  onChoice: (
    session: DaySession,
    choice: DayRolloverChoice,
    recordedAt: string,
    routeToEnd: boolean,
  ) => void;
  session: DaySession;
}

function RecoveryPage({ currentDate, now, onChoice, session }: RecoveryPageProps) {
  const choose = (choice: DayRolloverChoice) => {
    const recordedAt = now();
    const next = applyDayRolloverChoice(session, choice, recordedAt);
    onChoice(next, choice, recordedAt, choice === 'review-and-close');
  };
  return (
    <section className="w2a2b-flow-page" data-testid="track-b-rollover">
      <header className="w2a2b-recovery-header">
        <RotateCcw aria-hidden="true" size={28} />
        <span>
          <small>Active Day Session found</small>
          <h1>Review the date change</h1>
        </span>
      </header>
      <section className="w2a2b-review-card">
        <dl>
          <div><dt>Open session</dt><dd>{session.date}</dd></div>
          <div><dt>Current date</dt><dd>{currentDate}</dd></div>
        </dl>
        <p>Turn OS will not silently create another day.</p>
      </section>
      <div className="w2a2b-recovery-actions">
        <button data-track-b-critical-target="true" onClick={() => choose('resume')} type="button">
          <strong>Resume</strong>
          <small>Keep working in the open session.</small>
        </button>
        <button
          data-track-b-critical-target="true"
          onClick={() => choose('review-and-close')}
          type="button"
        >
          <strong>Review and close</strong>
          <small>Review and close that day.</small>
        </button>
        <button
          data-track-b-critical-target="true"
          onClick={() => choose('reopen-as-correction')}
          type="button"
        >
          <strong>Reopen as correction</strong>
          <small>Continue with an explicit correction state.</small>
        </button>
      </div>
    </section>
  );
}

export interface DayTaskWorkspaceProps {
  accountId: string;
  activeWalkSessionId?: string;
  crews: readonly TrackBCrewOption[];
  currentDate: string;
  events?: readonly DaySessionEvent[];
  existingSessions?: readonly DaySession[];
  idFactory?: () => string;
  initialView?: 'home' | 'start-day';
  initialSession?: DaySession;
  initialTask?: TodayTask | null;
  now?: () => string;
  onDayStateChange?: (
    change: DayTaskStateChange,
  ) => boolean | Promise<boolean> | void;
  onExternalAction?: (action: 'import-work' | 'assign-crews' | 'start-walk') => void;
  crewsNow?: readonly HomeCrewNowLine[];
  glance?: HomeGlance;
  onOpenCrew?: (crewId: string) => void;
  onOpenQueueId?: (queueId: TodayTaskQueueId) => void;
  onOpenTaskDetail?: () => void;
  onOpenActiveWalk?: (
    walkSessionId: string,
    intent: 'return' | 'end',
  ) => void;
  onRequestStartDay?: () => void;
  acceptedWalkMeta?: Readonly<Record<string, { at?: string; contact: string }>>;
  onExportBackup?: () => Promise<string>;
  onExportReport?: (dayNumber?: number) => Promise<string>;
  onOpenUnitFromHome?: (unitId: string) => void;
  onViewChange?: (viewId: WorkspaceView['id']) => void;
  queueCounts?: Readonly<Record<TodayTaskQueueId, number>>;
  propertyRoster: PropertyRoster;
  releases: readonly DailyReleaseBatch[];
  startDayPrefill?: StartDayPrefill;
  startedBy: string;
}

export interface DayTaskStateChange {
  event?: DaySessionEvent;
  reason:
    | 'day-started'
    | 'day-closed'
    | 'recovery-resumed'
    | 'recovery-review'
    | 'recovery-reopened';
  recordedAt: string;
  session: DaySession;
}

export function DayTaskWorkspace({
  accountId,
  activeWalkSessionId,
  crews,
  currentDate,
  events: initialEvents = [],
  existingSessions = [],
  crewsNow,
  glance,
  onOpenCrew,
  idFactory = createId,
  initialView = 'home',
  initialSession,
  initialTask,
  now = nowIso,
  onDayStateChange,
  onExternalAction,
  onOpenQueueId,
  onOpenTaskDetail,
  onOpenActiveWalk,
  acceptedWalkMeta,
  onExportBackup,
  onExportReport,
  onOpenUnitFromHome,
  onRequestStartDay,
  onViewChange,
  propertyRoster,
  releases,
  queueCounts,
  startDayPrefill,
  startedBy,
}: DayTaskWorkspaceProps) {
  const recovery = getDayRecoveryDecision(
    initialSession ? [initialSession, ...existingSessions] : existingSessions,
    accountId,
    propertyRoster.propertyId,
    currentDate,
  );
  const [view, setViewState] = useState<WorkspaceView>(
    recovery.kind === 'date-rollover'
      ? { id: 'recovery' }
      : { id: initialView },
  );
  const setView = useCallback((nextView: WorkspaceView) => {
    setViewState(nextView);
    onViewChange?.(nextView.id);
    document.getElementById('launch-command-center-main')
      ?.scrollTo({ behavior: 'auto', top: 0 });
  }, [onViewChange]);
  useEffect(() => {
    onViewChange?.(view.id);
    return () => onViewChange?.('home');
    // Report only on mount/unmount; interactive transitions go through setView.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [session, setSession] = useState<DaySession | undefined>(
    recovery.session ?? initialSession,
  );
  const [events, setEvents] = useState<readonly DaySessionEvent[]>(initialEvents);
  const [receipt, setReceipt] = useState('');
  const taskProjection = useMemo(
    () => session
      ? projectTodayTaskForSession(propertyRoster, releases, session, initialTask)
      : { errors: [] as readonly string[], task: undefined },
    [initialTask, propertyRoster, releases, session],
  );
  const task = taskProjection.task ?? null;
  const acceptedToday = useMemo(() => {
    const unitNumberById = new Map(propertyRoster.units.map((unit) =>
      [unit.id, unit.unitNumber]));
    const byUnit = new Map<string, { trades: Set<string>; unitId: string }>();
    for (const event of events) {
      if (event.eventType !== 'property-accepted') continue;
      if (!event.unitId || !event.recordedAt.startsWith(currentDate)) continue;
      const entry = byUnit.get(event.unitId)
        ?? { trades: new Set<string>(), unitId: event.unitId };
      if (event.trade) entry.trades.add(event.trade);
      byUnit.set(event.unitId, entry);
    }
    return [...byUnit.values()]
      .map((entry) => ({
        trades: [...entry.trades],
        unitId: entry.unitId,
        unitNumber: unitNumberById.get(entry.unitId) ?? entry.unitId,
      }))
      .sort((left, right) => left.unitNumber.localeCompare(right.unitNumber));
  }, [currentDate, events, propertyRoster.units]);

  const externalAction = (action: 'import-work' | 'assign-crews' | 'start-walk') => {
    onExternalAction?.(action);
    setReceipt(
      action === 'import-work'
        ? 'Manual release review opened. Record exactly what the property released.'
        : action === 'assign-crews'
          ? 'Crew assignment handoff requested. Integration owns the assignment route.'
          : 'Walk handoff requested. Integration owns the deterministic walk route.',
    );
  };

  if (view.id === 'start-day') {
    return (
      <StartDayFlow
        accountId={accountId}
        crews={crews}
        currentDate={currentDate}
        existingSessions={session ? [session, ...existingSessions] : existingSessions}
        idFactory={idFactory}
        now={now}
        onCancel={() => setView({ id: 'home' })}
        onImportWork={() => externalAction('import-work')}
        onStarted={async (nextSession, event) => {
          const persisted = await onDayStateChange?.({
            event,
            reason: 'day-started',
            recordedAt: event.recordedAt,
            session: nextSession,
          });
          if (persisted === false) return false;
          setSession(nextSession);
          setEvents((current) => [...current, event]);
          setReceipt('Day Session started and restored as Los’s personal active day.');
          setView({ id: 'home' });
          return true;
        }}
        prefill={startDayPrefill}
        propertyId={propertyRoster.propertyId}
        propertyName={propertyRoster.propertyName}
        propertyRoster={propertyRoster}
        releases={releases}
        startedBy={startedBy}
      />
    );
  }
  if (view.id === 'end-day' && session) {
    return (
      <EndDayFlow
        activeWalkSessionId={activeWalkSessionId}
        acceptedToday={acceptedToday}
        acceptedWalkMeta={acceptedWalkMeta}
        events={events}
        now={now}
        onCancel={() => setView({ id: 'home' })}
        onClosed={async (nextSession, event) => {
          const persisted = await onDayStateChange?.({
            event,
            reason: 'day-closed',
            recordedAt: event.recordedAt,
            session: nextSession,
          });
          if (persisted === false) return false;
          setSession(nextSession);
          setEvents((current) => [...current, event]);
          setReceipt('Day Session closed. Unresolved work was not changed.');
          // Land on the dedicated closing page so the report + backup ritual
          // can never be missed on the way out.
          setView({ id: 'day-closed' });
          return true;
        }}
        onOpenActiveWalk={onOpenActiveWalk}
        recordedBy={startedBy}
        session={session}
        task={task}
      />
    );
  }
  if (view.id === 'day-closed') {
    return (
      <DayClosedPage
        acceptedToday={acceptedToday}
        acceptedWalkMeta={acceptedWalkMeta}
        currentDate={currentDate}
        onDone={() => setView({ id: 'home' })}
        onExportBackup={onExportBackup}
        onExportReport={onExportReport}
      />
    );
  }
  if (view.id === 'queue') {
    return (
      <QueuePage
        onBack={() => setView({ id: 'home' })}
        onStartWalk={() => onExternalAction?.('start-walk')}
        queue={view.queue}
      />
    );
  }
  if (view.id === 'recovery' && recovery.session) {
    return (
      <RecoveryPage
        currentDate={currentDate}
        now={now}
        onChoice={(nextSession, choice, recordedAt, routeToEnd) => {
          setSession(nextSession);
          onDayStateChange?.({
            reason: choice === 'resume'
              ? 'recovery-resumed'
              : choice === 'review-and-close'
                ? 'recovery-review'
                : 'recovery-reopened',
            recordedAt,
            session: nextSession,
          });
          setView({ id: routeToEnd ? 'end-day' : 'home' });
        }}
        session={recovery.session}
      />
    );
  }

  return (
    <>
      <DayTaskHome
        acceptedToday={acceptedToday}
        acceptedWalkMeta={acceptedWalkMeta}
        crewsNow={crewsNow}
        glance={glance}
        onOpenCrew={onOpenCrew}
        currentDate={currentDate}
        onOpenUnit={onOpenUnitFromHome}
        dayNumber={existingSessions.filter((candidate) =>
          candidate.status === 'closed').length + (session && isOpenDay(session) ? 1 : 0)
          || undefined}
        onExportBackup={onExportBackup}
        onExportReport={onExportReport}
        onAction={externalAction}
        onEndDay={() => setView({ id: 'end-day' })}
        onOpenQueue={(queue) => {
          if (onOpenQueueId) {
            onOpenQueueId(queue.id);
            return;
          }
          setView({ id: 'queue', queue });
        }}
        onOpenTaskDetail={onOpenTaskDetail}
        onStartDay={() => {
          if (onRequestStartDay) {
            onRequestStartDay();
            return;
          }
          setView({ id: 'start-day' });
        }}
        propertyName={propertyRoster.propertyName}
        rosterCount={propertyRoster.units.length}
        scopeErrors={isOpenDay(session) ? taskProjection.errors : []}
        session={session}
        task={isOpenDay(session) ? task : null}
        queueCounts={queueCounts}
      />
      {receipt ? (
        <div className="w2a2b-toast" role="status">
          <span>{receipt}</span>
          <button aria-label="Dismiss message" onClick={() => setReceipt('')} type="button">Dismiss</button>
        </div>
      ) : null}
    </>
  );
}
