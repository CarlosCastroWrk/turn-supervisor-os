// RETIRED (Aug 10 2026): no longer routed — the live Start Day is
// StartDayScreen.tsx (one screen, deterministic memo parser). Kept only for
// the dev preview harness. Do not fix Start Day bugs here.
import {
  useMemo,
  useRef,
  useState,
} from 'react';
import type { DaySessionKeyStatus } from '../../types';
import type {
  ProjectConfiguration,
  ProjectRosterUnitOption,
  PropertyContact,
  TrackACrewOption,
} from './contracts';
import { DailyReleaseSelector } from './DailyReleaseSelector';
import type {
  FastStartDayDraft,
  FastStartDaySubmission,
} from './phase2Workflow';
import {
  FAST_START_DAY_STEPS,
  availableDailyReleaseTradeChoices,
  clampFastStartDayStep,
  createFastStartDayDraft,
  defaultActiveCrewIds,
  prepareDailyReleasePlan,
  prepareFastStartDaySubmission,
} from './phase2Workflow';
import './trackA.css';

export interface FastStartDayFlowProps {
  readonly configuration: ProjectConfiguration;
  readonly contacts: readonly PropertyContact[];
  readonly crewOptions: readonly TrackACrewOption[];
  readonly currentDate: string;
  readonly currentStep?: number;
  readonly draft?: FastStartDayDraft;
  readonly onAddCrew?: (name: string, trade: 'paint' | 'clean') => string;
  readonly onCancel: () => void;
  readonly onDraftChange?: (draft: FastStartDayDraft) => void;
  readonly onStepChange?: (step: number) => void;
  readonly onStartDay: (
    submission: FastStartDaySubmission,
  ) => boolean | Promise<boolean>;
  readonly projectId: string;
  readonly propertyName: string;
  readonly doneUnitIds?: ReadonlySet<string>;
  readonly rosterUnits: readonly ProjectRosterUnitOption[];
}

const keyStatusOptions: readonly {
  label: string;
  value: DaySessionKeyStatus;
}[] = [
  { label: 'Received', value: 'yes' },
  { label: 'Not received', value: 'no' },
  { label: 'Partial / issue', value: 'partial-issue' },
];

const crewTradeLabel = {
  clean: 'Clean',
  paint: 'Paint',
} as const;

export function FastStartDayFlow({
  configuration,
  contacts,
  crewOptions,
  currentDate,
  currentStep,
  draft: controlledDraft,
  onAddCrew,
  onCancel,
  onDraftChange,
  onStepChange,
  onStartDay,
  projectId,
  propertyName,
  doneUnitIds,
  rosterUnits,
}: FastStartDayFlowProps) {
  const availableContacts = useMemo(() => contacts.filter((contact) =>
    contact.projectId === projectId && contact.activeForProject !== false),
  [contacts, projectId]);
  const savedCrewIds = useMemo(
    () => defaultActiveCrewIds(configuration, crewOptions),
    [configuration, crewOptions],
  );
  const availableTradeChoices = useMemo(
    () => availableDailyReleaseTradeChoices(configuration.enabledTrades),
    [configuration.enabledTrades],
  );
  const [internalStep, setInternalStep] = useState(0);
  const step = clampFastStartDayStep(currentStep ?? internalStep);
  const [internalDraft, setInternalDraft] = useState<FastStartDayDraft>(() =>
    createFastStartDayDraft({
      configuration,
      contacts,
      crewOptions,
      currentDate,
      projectId,
    }));
  const draft = controlledDraft ?? internalDraft;
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const startInFlight = useRef(false);

  const updateDraft = (
    update: (current: FastStartDayDraft) => FastStartDayDraft,
  ) => {
    const nextDraft = update(draft);
    if (controlledDraft === undefined) {
      setInternalDraft(nextDraft);
    }
    onDraftChange?.(nextDraft);
  };

  const moveToStep = (nextStep: number) => {
    const clampedStep = clampFastStartDayStep(nextStep);
    if (currentStep === undefined) {
      setInternalStep(clampedStep);
    }
    onStepChange?.(clampedStep);
  };

  const selectedContact = availableContacts.find((contact) =>
    contact.id === draft.propertyContactId);
  const releaseReview = prepareDailyReleasePlan({
    contacts: availableContacts,
    date: draft.date,
    draft: draft.releaseDraft,
    enabledTrades: configuration.enabledTrades,
    projectId,
    propertyContactId: draft.propertyContactId,
    rosterUnits,
  });

  const toggleCrew = (crew: TrackACrewOption) => {
    updateDraft((current) => {
      const currentIds = current.activeCrewIdsByTrade[crew.trade];
      return {
        ...current,
        activeCrewIdsByTrade: {
          ...current.activeCrewIdsByTrade,
          [crew.trade]: currentIds.includes(crew.id)
            ? currentIds.filter((crewId) => crewId !== crew.id)
            : [...currentIds, crew.id],
        },
        explicitStartConfirmation: false,
      };
    });
  };

  const [newCrewName, setNewCrewName] = useState<{ paint: string; clean: string }>({
    paint: '',
    clean: '',
  });
  const addCrewForTrade = (trade: 'paint' | 'clean') => {
    const name = newCrewName[trade].trim();
    if (!name || !onAddCrew) return;
    const id = onAddCrew(name, trade);
    updateDraft((current) => ({
      ...current,
      activeCrewIdsByTrade: {
        ...current.activeCrewIdsByTrade,
        [trade]: [...current.activeCrewIdsByTrade[trade], id],
      },
      explicitStartConfirmation: false,
    }));
    setNewCrewName((current) => ({ ...current, [trade]: '' }));
  };

  const continueFlow = () => {
    const nextErrors: string[] = [];
    if (step === 0) {
      if (!draft.date) nextErrors.push('Confirm the field date.');
      if (!selectedContact) nextErrors.push('Select an active Property Contact.');
      if (!draft.keyStatus) nextErrors.push('Record today’s key status.');
    }
    if (step === 1 && !releaseReview.ok) {
      nextErrors.push(...releaseReview.errors);
    }
    if (nextErrors.length > 0) {
      setErrors(nextErrors);
      return;
    }
    setErrors([]);
    moveToStep(step + 1);
  };

  const start = async () => {
    if (saved || startInFlight.current) return;
    const prepared = prepareFastStartDaySubmission({
      activeCrewIdsByTrade: draft.activeCrewIdsByTrade,
      contacts: availableContacts,
      crewOptions,
      date: draft.date,
      enabledTrades: configuration.enabledTrades,
      explicitStartConfirmation: draft.explicitStartConfirmation,
      keyStatus: draft.keyStatus,
      morningNote: draft.morningNote,
      projectId,
      propertyContactId: draft.propertyContactId,
      propertyName,
      releaseDraft: draft.releaseDraft,
      rosterUnits,
      schedule: draft.schedule,
    });
    if (!prepared.ok) {
      setErrors(prepared.errors);
      return;
    }
    startInFlight.current = true;
    setSaving(true);
    setSaved(false);
    setErrors([]);
    try {
      const persisted = await onStartDay(prepared.submission);
      if (!persisted) {
        setErrors([
          'Start Day was not saved. Nothing was started, released, or added to Activity. Retry, edit, or cancel.',
        ]);
        return;
      }
      setSaved(true);
    } catch {
      setErrors([
        'Start Day could not be saved. Nothing was started, released, or added to Activity. Retry, edit, or cancel.',
      ]);
    } finally {
      startInFlight.current = false;
      setSaving(false);
    }
  };

  return (
    <section
      aria-labelledby="w2a21a-start-day-title"
      className="w2a21a-start-day"
      data-fast-start-day="true"
    >
      <header className="w2a21a-start-day__header">
        <button
          aria-label="Cancel Start Day and go back"
          className="w2a21a-start-day__back"
          onClick={onCancel}
          type="button"
        >
          ← Back
        </button>
        <p>Personal field record</p>
        <h1 id="w2a21a-start-day-title">Start Day</h1>
        <p>
          Screen {step + 1} of {FAST_START_DAY_STEPS.length} · {
            FAST_START_DAY_STEPS[step].label
          }
        </p>
        <progress
          aria-label="Start Day progress"
          max={FAST_START_DAY_STEPS.length}
          value={step + 1}
        />
      </header>

      <div className="w2a21a-start-day__body">
        {step === 0 ? (
          <div className="w2a21a-start-day__stack">
            <section>
              <h2>Property and date</h2>
              <p><strong>{propertyName}</strong></p>
              <p className="w2a21a-start-day__today">
                Today · {draft.date}. A Day Session always covers the current
                field day.
              </p>
              <label>
                Property Contact
                <select
                  onChange={(event) => {
                    updateDraft((current) => ({
                      ...current,
                      explicitStartConfirmation: false,
                      propertyContactId: event.target.value,
                      releaseDraft: {
                        ...current.releaseDraft,
                        explicitConfirmation: false,
                      },
                    }));
                  }}
                  value={draft.propertyContactId}
                >
                  <option value="">Select contact</option>
                  {availableContacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.name} · {contact.role ?? contact.title}
                    </option>
                  ))}
                </select>
              </label>
            </section>
            <fieldset>
              <legend>Keys and access</legend>
              <div className="w2a21a-start-day__choice-grid">
                {keyStatusOptions.map((option) => (
                  <label key={option.value}>
                    <input
                      checked={draft.keyStatus === option.value}
                      name="phase2-key-status"
                      onChange={() => {
                        updateDraft((current) => ({
                          ...current,
                          explicitStartConfirmation: false,
                          keyStatus: option.value,
                        }));
                      }}
                      type="radio"
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
              <p className="w2a21a-setup__notice">
                Keys describe access. They do not release or authorize work.
              </p>
            </fieldset>
          </div>
        ) : null}

        {step === 1 ? (
          <section>
            <h2>Confirm today’s released work</h2>
            <p>
              Property roster, Daily Release, and Today’s Task remain separate.
            </p>
            <DailyReleaseSelector
              doneUnitIds={doneUnitIds}
              availableTradeChoices={availableTradeChoices}
              draft={draft.releaseDraft}
              onChange={(nextDraft) => {
                updateDraft((current) => ({
                  ...current,
                  explicitStartConfirmation: false,
                  releaseDraft: nextDraft,
                }));
              }}
              rosterUnits={rosterUnits}
            />
          </section>
        ) : null}

        {step === 2 ? (
          <div className="w2a21a-start-day__stack">
            <section>
              <div className="w2a21a-start-day__section-heading">
                <span>
                  <h2>Active crews</h2>
                  <p>
                    Saved defaults: {
                      savedCrewIds.paint.length + savedCrewIds.clean.length
                    } crews
                  </p>
                </span>
                <button
                  aria-expanded={draft.changeCrewsToday}
                  onClick={() => {
                    updateDraft((current) => ({
                      ...current,
                      activeCrewIdsByTrade: current.changeCrewsToday
                        ? savedCrewIds
                        : current.activeCrewIdsByTrade,
                      changeCrewsToday: !current.changeCrewsToday,
                      explicitStartConfirmation: false,
                    }));
                  }}
                  type="button"
                >
                  {draft.changeCrewsToday ? 'Use saved crews' : 'Changed today'}
                </button>
              </div>
              {draft.changeCrewsToday ? (
                (['paint', 'clean'] as const).filter(
                  (trade) => configuration.enabledTrades[trade],
                ).map((trade) => (
                  <fieldset key={trade}>
                    <legend>{crewTradeLabel[trade]}</legend>
                    {crewOptions.filter((crew) =>
                      crew.trade === trade && crew.active !== false).map((crew) => (
                      <label className="w2a21a-setup__check" key={crew.id}>
                        <input
                          checked={draft.activeCrewIdsByTrade[trade].includes(crew.id)}
                          onChange={() => toggleCrew(crew)}
                          type="checkbox"
                        />
                        {crew.name}
                      </label>
                    ))}
                    {onAddCrew ? (
                      <div className="w2a21a-add-crew">
                        <input
                          aria-label={`Add a ${crewTradeLabel[trade]} crew`}
                          onChange={(event) => setNewCrewName((current) => ({
                            ...current,
                            [trade]: event.target.value,
                          }))}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              addCrewForTrade(trade);
                            }
                          }}
                          placeholder={`Add ${crewTradeLabel[trade].toLowerCase()} crew`}
                          type="text"
                          value={newCrewName[trade]}
                        />
                        <button
                          disabled={!newCrewName[trade].trim()}
                          onClick={() => addCrewForTrade(trade)}
                          type="button"
                        >
                          Add
                        </button>
                      </div>
                    ) : null}
                  </fieldset>
                ))
              ) : (
                <ul className="w2a21a-start-day__summary-list">
                  {(['paint', 'clean'] as const).filter(
                    (trade) => configuration.enabledTrades[trade],
                  ).map((trade) => (
                    <li key={trade}>
                      <strong>{crewTradeLabel[trade]}</strong>
                      <span>
                        {draft.activeCrewIdsByTrade[trade].map((crewId) =>
                          crewOptions.find((crew) => crew.id === crewId)?.name
                          ?? `Unavailable crew (${crewId})`).join(', ') || 'None saved'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Schedule keeps its saved defaults; it left the Start Day flow to
                keep mornings fast. */}

            <section>
              <h2>Morning note <small>Optional</small></h2>
              <label>
                Personal note
                <textarea
                  onChange={(event) => {
                    updateDraft((current) => ({
                      ...current,
                      explicitStartConfirmation: false,
                      morningNote: event.target.value,
                    }));
                  }}
                  placeholder="Anything Los needs to remember this morning"
                  value={draft.morningNote}
                />
              </label>
            </section>
          </div>
        ) : null}

        {step === 3 ? (
          <section>
            <h2>Review and Start Day</h2>
            <dl className="w2a21a-setup__review">
              <div><dt>Property</dt><dd>{propertyName}</dd></div>
              <div><dt>Date</dt><dd>{draft.date}</dd></div>
              <div>
                <dt>Property Contact</dt>
                <dd>{selectedContact?.name ?? 'Not selected'}</dd>
              </div>
              <div>
                <dt>Keys</dt>
                <dd>
                  {keyStatusOptions.find((option) =>
                    option.value === draft.keyStatus)?.label
                    ?? 'Not recorded'}
                </dd>
              </div>
              <div>
                <dt>Daily Release</dt>
                <dd>
                  {releaseReview.ok
                    ? `${releaseReview.plan.selectedUnitIds.length} Units · ${releaseReview.plan.items.length} Paint/Clean sections`
                    : 'Needs review'}
                </dd>
              </div>
              <div>
                <dt>Active crews</dt>
                <dd>
                  {draft.activeCrewIdsByTrade.paint.length} Paint · {
                    draft.activeCrewIdsByTrade.clean.length
                  } Clean
                </dd>
              </div>
              <div>
                <dt>Work hours</dt>
                <dd>{draft.schedule.workStartTime}–{draft.schedule.workEndTime}</dd>
              </div>
              <div>
                <dt>Walkthrough</dt>
                <dd>{draft.schedule.walkthroughTime || 'Not scheduled'}</dd>
              </div>
              <div>
                <dt>Morning note</dt>
                <dd>{draft.morningNote || 'None'}</dd>
              </div>
              <div>
                <dt>Authority</dt>
                <dd>Paper TurnBoard remains authoritative</dd>
              </div>
            </dl>
            <label className="w2a21a-setup__switch">
              <input
                checked={draft.explicitStartConfirmation}
                onChange={(event) => updateDraft((current) => ({
                  ...current,
                  explicitStartConfirmation: event.target.checked,
                }))}
                type="checkbox"
              />
              <span>
                <strong>I reviewed this Start Day record</strong>
                <small>
                  Crew-reported completion will remain separate from Los inspection and property acceptance.
                </small>
              </span>
            </label>
            {errors.length > 0 ? (
              <div className="w2a21a-setup__errors" role="alert">
                <strong>Start Day was not saved.</strong>
                <ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul>
              </div>
            ) : null}
            {saved ? (
              <div className="w2a21a-start-day__success" role="status">
                Start Day was durably saved by the host.
              </div>
            ) : null}
            <button
              className="w2a21a-setup__primary"
              disabled={saving || saved}
              onClick={() => void start()}
              type="button"
            >
              {saving ? 'Saving…' : saved ? 'Day started' : 'Start Day'}
            </button>
            <p className="w2a21a-setup__supporting">
              No success appears until the host confirms the complete atomic save.
            </p>
          </section>
        ) : null}

        {step < 3 && errors.length > 0 ? (
          <div className="w2a21a-setup__errors" role="alert">
            <strong>Review this screen.</strong>
            <ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul>
          </div>
        ) : null}
      </div>

      <footer className="w2a21a-start-day__footer">
        {step === 0 ? (
          <button onClick={onCancel} type="button">Cancel</button>
        ) : (
          <button
            onClick={() => {
              setErrors([]);
              moveToStep(step - 1);
            }}
            type="button"
          >
            Back
          </button>
        )}
        {step < FAST_START_DAY_STEPS.length - 1 ? (
          <button
            className="w2a21a-setup__primary"
            onClick={continueFlow}
            type="button"
          >
            Continue
          </button>
        ) : null}
      </footer>
    </section>
  );
}
