import {
  ChevronRight,
  ClipboardCheck,
  FileUp,
  Flag,
  LogOut,
  Target,
  Users,
  X,
} from 'lucide-react';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { NativePageHeader, NativePageTransition } from './NativePage';
import {
  NATIVE_GOAL_METRICS,
  NATIVE_GOAL_MILESTONES,
  NATIVE_HOME_SUMMARIES,
  calculateNativeDailyGoalProgress,
  getNativeHomeSummaryCounts,
  isValidNativeDailyGoal,
  selectNativeHomeSummary,
  type NativeDailyGoal,
  type NativeHomeRecord,
  type NativeHomeSummaryDestination,
} from './model';

export const NATIVE_HOME_ACTIONS = [
  { id: 'import-work', label: 'Import work' },
  { id: 'assign-crews', label: 'Assign crews' },
  { id: 'start-walk', label: 'Start walk' },
  { id: 'end-day', label: 'End day' },
] as const;

export type NativeHomeActionId = (typeof NATIVE_HOME_ACTIONS)[number]['id'];

const actionIcons: Record<NativeHomeActionId, ReactNode> = {
  'assign-crews': <Users aria-hidden="true" size={20} />,
  'end-day': <LogOut aria-hidden="true" size={20} />,
  'import-work': <FileUp aria-hidden="true" size={20} />,
  'start-walk': <ClipboardCheck aria-hidden="true" size={20} />,
};

const DEFAULT_EDITABLE_GOAL: NativeDailyGoal = {
  metric: 'sections',
  milestone: 'los-inspected',
  target: 1,
};

const focusableSheetElements = (container: HTMLElement) =>
  Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => (
    !element.hasAttribute('hidden')
    && element.getAttribute('aria-hidden') !== 'true'
    && element.tabIndex >= 0
  ));

interface NativeDailyGoalSheetProps {
  goal: NativeDailyGoal;
  onClose: () => void;
  onSave: (goal: NativeDailyGoal) => void;
}

export function NativeDailyGoalSheet({
  goal,
  onClose,
  onSave,
}: NativeDailyGoalSheetProps) {
  const [draft, setDraft] = useState<NativeDailyGoal>(goal);
  const titleId = useId();
  const metricRef = useRef<HTMLSelectElement | null>(null);
  const sheetRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => metricRef.current?.focus({ preventScroll: true }));
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !sheetRef.current) return;
      const focusable = focusableSheetElements(sheetRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const save = () => {
    if (!isValidNativeDailyGoal(draft)) return;
    onSave(draft);
    onClose();
  };

  return (
    <div className="w2a1-a-sheet-layer">
      <button
        aria-label="Close daily goal"
        className="w2a1-a-sheet-layer__scrim"
        onClick={onClose}
        type="button"
      />
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="w2a1-a-sheet"
        ref={sheetRef}
        role="dialog"
      >
        <div className="w2a1-a-sheet__grabber" aria-hidden="true" />
        <header className="w2a1-a-sheet__header">
          <span>
            <small>Personal daily plan</small>
            <h2 id={titleId}>Set today&apos;s goal</h2>
          </span>
          <button aria-label="Close daily goal" onClick={onClose} type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </header>

        <div className="w2a1-a-form-group">
          <label>
            <span>Metric</span>
            <select
              onChange={(event) => {
                const metric = event.currentTarget.value as NativeDailyGoal['metric'];
                setDraft((current) => ({ ...current, metric }));
              }}
              ref={metricRef}
              value={draft.metric}
            >
              {NATIVE_GOAL_METRICS.map((metric) => (
                <option key={metric.id} value={metric.id}>{metric.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Milestone</span>
            <select
              onChange={(event) => {
                const milestone = event.currentTarget.value as NativeDailyGoal['milestone'];
                setDraft((current) => ({ ...current, milestone }));
              }}
              value={draft.milestone}
            >
              {NATIVE_GOAL_MILESTONES.map((milestone) => (
                <option key={milestone.id} value={milestone.id}>{milestone.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Target</span>
            <input
              inputMode="numeric"
              max={10_000}
              min={1}
              onChange={(event) => {
                const target = Number(event.currentTarget.value);
                setDraft((current) => ({ ...current, target }));
              }}
              type="number"
              value={Number.isNaN(draft.target) ? '' : draft.target}
            />
          </label>
        </div>

        <p className="w2a1-a-safety-copy">
          This is Los&apos;s personal goal. It does not change the paper TurnBoard or any official status.
        </p>
        <button
          className="w2a1-a-primary-button"
          disabled={!isValidNativeDailyGoal(draft)}
          onClick={save}
          type="button"
        >
          Save goal
        </button>
      </section>
    </div>
  );
}

export interface NativeHomeSurfaceProps {
  dateLabel: string;
  goal: NativeDailyGoal | null;
  goalActual: number;
  onDialogOpenChange?: (open: boolean) => void;
  onOpenSummary: (destination: NativeHomeSummaryDestination) => void;
  onQuickAction: (actionId: NativeHomeActionId) => void;
  onSaveGoal: (goal: NativeDailyGoal) => void;
  propertyName: string;
  records: readonly NativeHomeRecord[];
}

export function NativeHomeSurface({
  dateLabel,
  goal,
  goalActual,
  onDialogOpenChange,
  onOpenSummary,
  onQuickAction,
  onSaveGoal,
  propertyName,
  records,
}: NativeHomeSurfaceProps) {
  const [goalOpen, setGoalOpen] = useState(false);
  const goalButtonRef = useRef<HTMLButtonElement | null>(null);
  const counts = useMemo(() => getNativeHomeSummaryCounts(records), [records]);
  const progress = goal ? calculateNativeDailyGoalProgress(goal, goalActual) : null;

  useEffect(() => {
    onDialogOpenChange?.(goalOpen);
    return () => onDialogOpenChange?.(false);
  }, [goalOpen, onDialogOpenChange]);

  const closeGoal = () => {
    setGoalOpen(false);
    window.requestAnimationFrame(() => goalButtonRef.current?.focus({ preventScroll: true }));
  };

  return (
    <NativePageTransition>
      <section
        aria-label="Home command center"
        aria-hidden={goalOpen || undefined}
        className="w2a1-a-root w2a1-a-scroll-page w2a1-a-home"
        inert={goalOpen || undefined}
      >
        <header className="w2a1-a-root-heading">
          <h1>Home</h1>
          <p><strong>{propertyName}</strong><span aria-hidden="true"> · </span>{dateLabel}</p>
        </header>

        <section className="w2a1-a-section" aria-labelledby="w2a1-a-goal-heading">
          <h2 id="w2a1-a-goal-heading">Today</h2>
          <button
            className="w2a1-a-goal-row"
            onClick={() => setGoalOpen(true)}
            ref={goalButtonRef}
            type="button"
          >
            <span className="w2a1-a-row-icon"><Target aria-hidden="true" size={21} /></span>
            <span className="w2a1-a-row-content">
              <strong>{progress ? progress.progressCopy : 'Set today\u2019s goal'}</strong>
              <small>{progress
                ? `${progress.percentage}% complete · ${NATIVE_GOAL_MILESTONES.find(({ id }) => id === progress.milestone)?.label}`
                : 'Choose one metric, milestone, and target.'}</small>
              {progress ? (
                <span
                  aria-label={`${progress.percentage}% of today\u2019s personal goal`}
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={progress.percentage}
                  className="w2a1-a-progress"
                  role="progressbar"
                >
                  <span style={{ width: `${progress.percentage}%` }} />
                </span>
              ) : null}
            </span>
            <ChevronRight aria-hidden="true" className="w2a1-a-chevron" size={19} />
          </button>
        </section>

        <section className="w2a1-a-section" aria-labelledby="w2a1-a-status-heading">
          <h2 id="w2a1-a-status-heading">Current work</h2>
          <div className="w2a1-a-inset-list">
            {NATIVE_HOME_SUMMARIES.map((summary) => (
              <button
                className="w2a1-a-inset-row"
                key={summary.id}
                onClick={() => onOpenSummary(selectNativeHomeSummary(records, summary.id))}
                type="button"
              >
                <span className={`w2a1-a-summary-dot is-${summary.id}`} aria-hidden="true" />
                <span className="w2a1-a-row-content"><strong>{summary.label}</strong></span>
                <span className="w2a1-a-row-value">{counts[summary.id]}</span>
                <ChevronRight aria-hidden="true" className="w2a1-a-chevron" size={19} />
              </button>
            ))}
          </div>
        </section>

        <section className="w2a1-a-section" aria-labelledby="w2a1-a-actions-heading">
          <h2 id="w2a1-a-actions-heading">Field actions</h2>
          <div className="w2a1-a-inset-list">
            {NATIVE_HOME_ACTIONS.map((action) => (
              <button
                className="w2a1-a-inset-row"
                key={action.id}
                onClick={() => onQuickAction(action.id)}
                type="button"
              >
                <span className="w2a1-a-row-icon">{actionIcons[action.id]}</span>
                <span className="w2a1-a-row-content"><strong>{action.label}</strong></span>
                <ChevronRight aria-hidden="true" className="w2a1-a-chevron" size={19} />
              </button>
            ))}
          </div>
        </section>

        <p className="w2a1-a-paper-note">
          <Flag aria-hidden="true" size={16} />
          Paper remains authoritative. Home is a personal working view.
        </p>
      </section>

      {goalOpen ? (
        <NativeDailyGoalSheet
          goal={goal ?? DEFAULT_EDITABLE_GOAL}
          onClose={closeGoal}
          onSave={onSaveGoal}
        />
      ) : null}
    </NativePageTransition>
  );
}

export interface NativeHomeSummaryPageProps {
  destination: NativeHomeSummaryDestination;
  onBack: () => void;
  onOpenRecord: (record: NativeHomeRecord) => void;
  onStartWalk?: () => void;
}

export function NativeHomeSummaryPage({
  destination,
  onBack,
  onOpenRecord,
  onStartWalk,
}: NativeHomeSummaryPageProps) {
  return (
    <NativePageTransition>
      <section className="w2a1-a-root w2a1-a-detail-page">
        <NativePageHeader onBack={onBack} title={destination.label} />
        <div className="w2a1-a-detail-page__scroll">
          {destination.id === 'ready-to-walk'
            && destination.records.length > 0
            && onStartWalk ? (
              <button
                className="w2a1-a-start-walk"
                data-w2a1-critical-target="true"
                onClick={onStartWalk}
                type="button"
              >
                Start Walk with the property
              </button>
            ) : null}
          {destination.records.length === 0 ? (
            <section className="w2a1-a-empty-state" aria-live="polite">
              <Flag aria-hidden="true" size={24} />
              <h2>{destination.emptyMessage}</h2>
              <p>The Home count is zero, so no unrelated Units are shown.</p>
            </section>
          ) : (
            <section className="w2a1-a-section" aria-labelledby="w2a1-a-summary-results">
              <h2 id="w2a1-a-summary-results">
                {(() => {
                  // Records are Unit+Trade jobs. Show "N Units" when it's one job
                  // per unit, else "X units · Y trades" so 1 unit / 2 trades never
                  // reads as "2 Units".
                  const unitCount = new Set(
                    destination.records.map((record) => record.destinationId),
                  ).size;
                  const jobCount = destination.records.length;
                  if (unitCount === jobCount) {
                    return `${unitCount} ${unitCount === 1 ? 'Unit' : 'Units'}`;
                  }
                  return `${unitCount} ${unitCount === 1 ? 'unit' : 'units'} · ${jobCount} ${jobCount === 1 ? 'trade' : 'trades'}`;
                })()}
              </h2>
              {(() => {
                // Los reads queues one column per trade (Paint | Clean), each in
                // numerical order — not the two trades stacked on top of each other.
                const numeric = (left: NativeHomeRecord, right: NativeHomeRecord) =>
                  left.unitLabel.localeCompare(right.unitLabel, undefined, { numeric: true });
                const paint = destination.records
                  .filter((record) => (record.meta ?? '').startsWith('Paint'))
                  .sort(numeric);
                const clean = destination.records
                  .filter((record) => (record.meta ?? '').startsWith('Clean'))
                  .sort(numeric);
                const other = destination.records
                  .filter((record) => !(record.meta ?? '').startsWith('Paint')
                    && !(record.meta ?? '').startsWith('Clean'))
                  .sort(numeric);
                const row = (record: NativeHomeRecord) => (
                  <button
                    className="w2a1-a-inset-row"
                    key={record.id}
                    onClick={() => onOpenRecord(record)}
                    type="button"
                  >
                    <span className="w2a1-a-row-content">
                      <strong>{record.unitLabel}</strong>
                      {record.meta ? <small>{record.meta}</small> : null}
                    </span>
                    <ChevronRight aria-hidden="true" className="w2a1-a-chevron" size={19} />
                  </button>
                );
                if (paint.length === 0 && clean.length === 0) {
                  return <div className="w2a1-a-inset-list">{other.map(row)}</div>;
                }
                return (
                  <div className="w2a1-a-trade-columns">
                    <div>
                      <h3>Paint · {paint.length}</h3>
                      <div className="w2a1-a-inset-list">{paint.map(row)}</div>
                    </div>
                    <div>
                      <h3>Clean · {clean.length}</h3>
                      <div className="w2a1-a-inset-list">{clean.map(row)}</div>
                    </div>
                    {other.length > 0 ? (
                      <div className="w2a1-a-trade-columns__other">
                        <div className="w2a1-a-inset-list">{other.map(row)}</div>
                      </div>
                    ) : null}
                  </div>
                );
              })()}
            </section>
          )}
        </div>
      </section>
    </NativePageTransition>
  );
}
