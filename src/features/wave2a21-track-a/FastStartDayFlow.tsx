import {
  useMemo,
  useRef,
  useState,
} from 'react';
import type { DaySessionKeyStatus } from '../../types';
import type {
  ProjectConfiguration,
  ProjectDefaultSchedule,
  ProjectRosterUnitOption,
  PropertyContact,
  TrackACrewOption,
} from './contracts';
import { DailyReleaseSelector } from './DailyReleaseSelector';
import type {
  DailyReleaseDraft,
  FastStartDaySubmission,
} from './phase2Workflow';
import {
  FAST_START_DAY_STEPS,
  availableDailyReleaseTradeChoices,
  clampFastStartDayStep,
  createDailyReleaseDraft,
  defaultActiveCrewIds,
  prepareDailyReleasePlan,
  prepareFastStartDaySubmission,
  resolveProjectDefaultSchedule,
} from './phase2Workflow';
import './trackA.css';

export interface FastStartDayFlowProps {
  readonly configuration: ProjectConfiguration;
  readonly contacts: readonly PropertyContact[];
  readonly crewOptions: readonly TrackACrewOption[];
  readonly currentDate: string;
  readonly currentStep?: number;
  readonly onCancel: () => void;
  readonly onStepChange?: (step: number) => void;
  readonly onStartDay: (
    submission: FastStartDaySubmission,
  ) => boolean | Promise<boolean>;
  readonly projectId: string;
  readonly propertyName: string;
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
  onCancel,
  onStepChange,
  onStartDay,
  projectId,
  propertyName,
  rosterUnits,
}: FastStartDayFlowProps) {
  const availableContacts = useMemo(() => contacts.filter((contact) =>
    contact.projectId === projectId && contact.activeForProject !== false),
  [contacts, projectId]);
  const savedSchedule = useMemo(
    () => resolveProjectDefaultSchedule(configuration),
    [configuration],
  );
  const savedCrewIds = useMemo(
    () => defaultActiveCrewIds(configuration, crewOptions),
    [configuration, crewOptions],
  );
  const availableTradeChoices = useMemo(
    () => availableDailyReleaseTradeChoices(configuration.enabledTrades),
    [configuration.enabledTrades],
  );
  const defaultTradeChoice = availableTradeChoices[0] ?? 'Paint';
  const [internalStep, setInternalStep] = useState(0);
  const step = clampFastStartDayStep(currentStep ?? internalStep);
  const [date, setDate] = useState(currentDate);
  const [propertyContactId, setPropertyContactId] = useState(
    availableContacts.some((contact) =>
      contact.id === configuration.defaultPropertyContactId)
      ? configuration.defaultPropertyContactId
      : availableContacts[0]?.id ?? '',
  );
  const [keyStatus, setKeyStatus] = useState<DaySessionKeyStatus>();
  const [releaseDraft, setReleaseDraft] = useState<DailyReleaseDraft>(
    () => createDailyReleaseDraft(defaultTradeChoice),
  );
  const [activeCrewIdsByTrade, setActiveCrewIdsByTrade] = useState(savedCrewIds);
  const [schedule, setSchedule] = useState<ProjectDefaultSchedule>(savedSchedule);
  const [changeCrewsToday, setChangeCrewsToday] = useState(false);
  const [changeScheduleToday, setChangeScheduleToday] = useState(false);
  const [morningNote, setMorningNote] = useState('');
  const [explicitStartConfirmation, setExplicitStartConfirmation] = useState(false);
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const startInFlight = useRef(false);

  const moveToStep = (nextStep: number) => {
    const clampedStep = clampFastStartDayStep(nextStep);
    if (currentStep === undefined) {
      setInternalStep(clampedStep);
    }
    onStepChange?.(clampedStep);
  };

  const selectedContact = availableContacts.find((contact) =>
    contact.id === propertyContactId);
  const releaseReview = prepareDailyReleasePlan({
    contacts: availableContacts,
    date,
    draft: releaseDraft,
    enabledTrades: configuration.enabledTrades,
    projectId,
    propertyContactId,
    rosterUnits,
  });

  const toggleCrew = (crew: TrackACrewOption) => {
    setActiveCrewIdsByTrade((current) => {
      const currentIds = current[crew.trade];
      return {
        ...current,
        [crew.trade]: currentIds.includes(crew.id)
          ? currentIds.filter((crewId) => crewId !== crew.id)
          : [...currentIds, crew.id],
      };
    });
    setExplicitStartConfirmation(false);
  };

  const continueFlow = () => {
    const nextErrors: string[] = [];
    if (step === 0) {
      if (!date) nextErrors.push('Confirm the field date.');
      if (!selectedContact) nextErrors.push('Select an active Property Contact.');
      if (!keyStatus) nextErrors.push('Record today’s key status.');
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
      activeCrewIdsByTrade,
      contacts: availableContacts,
      crewOptions,
      date,
      enabledTrades: configuration.enabledTrades,
      explicitStartConfirmation,
      keyStatus,
      morningNote,
      projectId,
      propertyContactId,
      propertyName,
      releaseDraft,
      rosterUnits,
      schedule,
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
              <label>
                Field date
                <input
                  onChange={(event) => {
                    setDate(event.target.value);
                    setReleaseDraft((current) => ({
                      ...current,
                      explicitConfirmation: false,
                    }));
                    setExplicitStartConfirmation(false);
                  }}
                  type="date"
                  value={date}
                />
              </label>
              <label>
                Property Contact
                <select
                  onChange={(event) => {
                    setPropertyContactId(event.target.value);
                    setReleaseDraft((current) => ({
                      ...current,
                      explicitConfirmation: false,
                    }));
                    setExplicitStartConfirmation(false);
                  }}
                  value={propertyContactId}
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
                      checked={keyStatus === option.value}
                      name="phase2-key-status"
                      onChange={() => {
                        setKeyStatus(option.value);
                        setExplicitStartConfirmation(false);
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
              availableTradeChoices={availableTradeChoices}
              draft={releaseDraft}
              onChange={(nextDraft) => {
                setReleaseDraft(nextDraft);
                setExplicitStartConfirmation(false);
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
                  aria-expanded={changeCrewsToday}
                  onClick={() => {
                    if (changeCrewsToday) {
                      setActiveCrewIdsByTrade(savedCrewIds);
                      setExplicitStartConfirmation(false);
                    }
                    setChangeCrewsToday((current) => !current);
                  }}
                  type="button"
                >
                  {changeCrewsToday ? 'Use saved crews' : 'Changed today'}
                </button>
              </div>
              {changeCrewsToday ? (
                (['paint', 'clean'] as const).filter(
                  (trade) => configuration.enabledTrades[trade],
                ).map((trade) => (
                  <fieldset key={trade}>
                    <legend>{crewTradeLabel[trade]}</legend>
                    {crewOptions.filter((crew) =>
                      crew.trade === trade && crew.active !== false).map((crew) => (
                      <label className="w2a21a-setup__check" key={crew.id}>
                        <input
                          checked={activeCrewIdsByTrade[trade].includes(crew.id)}
                          onChange={() => toggleCrew(crew)}
                          type="checkbox"
                        />
                        {crew.name}
                      </label>
                    ))}
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
                        {activeCrewIdsByTrade[trade].map((crewId) =>
                          crewOptions.find((crew) => crew.id === crewId)?.name
                          ?? `Unavailable crew (${crewId})`).join(', ') || 'None saved'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <div className="w2a21a-start-day__section-heading">
                <span>
                  <h2>Schedule</h2>
                  <p>
                    {savedSchedule.workStartTime || 'Not set'}–{
                      savedSchedule.workEndTime || 'Not set'
                    }
                    {savedSchedule.walkthroughTime
                      ? ` · Walkthrough ${savedSchedule.walkthroughTime}`
                      : ' · No default walkthrough'}
                  </p>
                </span>
                <button
                  aria-expanded={changeScheduleToday}
                  onClick={() => {
                    if (changeScheduleToday) {
                      setSchedule(savedSchedule);
                      setExplicitStartConfirmation(false);
                    }
                    setChangeScheduleToday((current) => !current);
                  }}
                  type="button"
                >
                  {changeScheduleToday ? 'Use saved schedule' : 'Changed today'}
                </button>
              </div>
              {changeScheduleToday ? (
                <div className="w2a21a-setup__columns">
                  <label>
                    Work start
                    <input
                      onChange={(event) => {
                        setSchedule((current) => ({
                          ...current,
                          workStartTime: event.target.value,
                        }));
                        setExplicitStartConfirmation(false);
                      }}
                      type="time"
                      value={schedule.workStartTime}
                    />
                  </label>
                  <label>
                    Work end
                    <input
                      onChange={(event) => {
                        setSchedule((current) => ({
                          ...current,
                          workEndTime: event.target.value,
                        }));
                        setExplicitStartConfirmation(false);
                      }}
                      type="time"
                      value={schedule.workEndTime}
                    />
                  </label>
                  <label>
                    Walkthrough (optional)
                    <input
                      onChange={(event) => {
                        setSchedule((current) => ({
                          ...current,
                          walkthroughTime: event.target.value || undefined,
                        }));
                        setExplicitStartConfirmation(false);
                      }}
                      type="time"
                      value={schedule.walkthroughTime ?? ''}
                    />
                  </label>
                </div>
              ) : null}
            </section>

            <section>
              <h2>Morning note <small>Optional</small></h2>
              <label>
                Personal note
                <textarea
                  onChange={(event) => {
                    setMorningNote(event.target.value);
                    setExplicitStartConfirmation(false);
                  }}
                  placeholder="Anything Los needs to remember this morning"
                  value={morningNote}
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
              <div><dt>Date</dt><dd>{date}</dd></div>
              <div>
                <dt>Property Contact</dt>
                <dd>{selectedContact?.name ?? 'Not selected'}</dd>
              </div>
              <div>
                <dt>Keys</dt>
                <dd>
                  {keyStatusOptions.find((option) => option.value === keyStatus)?.label
                    ?? 'Not recorded'}
                </dd>
              </div>
              <div>
                <dt>Daily Release</dt>
                <dd>
                  {releaseReview.ok
                    ? `${releaseReview.plan.selectedUnitIds.length} Units · ${releaseReview.plan.items.length} section-trades`
                    : 'Needs review'}
                </dd>
              </div>
              <div>
                <dt>Active crews</dt>
                <dd>
                  {activeCrewIdsByTrade.paint.length} Paint · {
                    activeCrewIdsByTrade.clean.length
                  } Clean
                </dd>
              </div>
              <div>
                <dt>Work hours</dt>
                <dd>{schedule.workStartTime}–{schedule.workEndTime}</dd>
              </div>
              <div>
                <dt>Walkthrough</dt>
                <dd>{schedule.walkthroughTime || 'Not scheduled'}</dd>
              </div>
              <div>
                <dt>Authority</dt>
                <dd>Paper TurnBoard remains authoritative</dd>
              </div>
            </dl>
            <label className="w2a21a-setup__switch">
              <input
                checked={explicitStartConfirmation}
                onChange={(event) => setExplicitStartConfirmation(event.target.checked)}
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
