import { useMemo, useState, type ChangeEvent } from 'react';
import type {
  BrowserPermissionState,
  ProjectActivationDraft,
  ProjectConfiguration,
  ProjectRosterUnitOption,
  PropertyContact,
  PropertyContactRole,
  TrackACrewOption,
  TrackASetupCrew,
  TrackASetupUnit,
} from './contracts';
import { PROPERTY_CONTACT_ROLES } from './contracts';
import {
  resolveProjectDefaultSchedule,
} from './phase2Workflow';
import {
  PROJECT_SETUP_STEPS,
  clampProjectSetupStep,
} from './projectSetup';
import './trackA.css';

export type ProjectSetupCrewOption = TrackACrewOption;

export interface ProjectSetupFlowProps {
  readonly activationErrors?: readonly string[];
  readonly cameraPermissionState?: BrowserPermissionState;
  readonly crewOptions?: readonly ProjectSetupCrewOption[];
  readonly currentStep: number;
  readonly draft: ProjectActivationDraft;
  readonly existingProjectRequiresConfirmation?: boolean;
  readonly onActivate: () => void;
  readonly onAddContact: () => void;
  readonly onDraftChange: (draft: ProjectActivationDraft) => void;
  readonly onExit: () => void;
  readonly onRemoveContact: (contactId: string) => void;
  readonly onStepChange: (step: number) => void;
  readonly rosterUnits?: readonly ProjectRosterUnitOption[];
}

const replaceContact = (
  contacts: readonly PropertyContact[],
  contactId: string,
  update: (contact: PropertyContact) => PropertyContact,
) => contacts.map((contact) => contact.id === contactId ? update(contact) : contact);

const contactRole = (contact: PropertyContact): PropertyContactRole => (
  contact.role
  ?? PROPERTY_CONTACT_ROLES.find((role) => role === contact.title)
  ?? 'Other'
);

const unitTypeSections = (unitType: TrackASetupUnit['unitType']) => (
  ['Common', 'A', 'B', 'C', 'D', 'E'].slice(0, unitType + 1)
);

const setupUnitType = (value: string | number): TrackASetupUnit['unitType'] => {
  const parsed = Number(value);
  return Math.min(5, Math.max(1, Number.isFinite(parsed) ? parsed : 3)) as
    TrackASetupUnit['unitType'];
};


export function ProjectSetupFlow({
  activationErrors = [],
  crewOptions = [],
  currentStep,
  draft,
  existingProjectRequiresConfirmation = false,
  onActivate,
  onAddContact,
  onDraftChange,
  onExit,
  onRemoveContact,
  onStepChange,
  rosterUnits = [],
}: ProjectSetupFlowProps) {
  const step = clampProjectSetupStep(currentStep);
  const schedule = resolveProjectDefaultSchedule(draft.configuration);
  const [unitPaste, setUnitPaste] = useState('');
  const [missingNotice, setMissingNotice] = useState<readonly string[] | null>(null);
  const [unitBuilding] = useState('');
  const [unitFloor] = useState('');
  const [unitType, setUnitType] = useState<TrackASetupUnit['unitType']>(3);
  const [rosterMessage, setRosterMessage] = useState('');
  const setupCrews = useMemo<readonly TrackASetupCrew[]>(
    () => draft.crews ?? crewOptions.map((crew) => ({
      active: crew.active !== false,
      id: crew.id,
      name: crew.name,
      projectId: draft.project.id,
      trade: crew.trade,
    })),
    [crewOptions, draft.crews, draft.project.id],
  );
  const setupUnits = useMemo<readonly TrackASetupUnit[]>(
    () => draft.units ?? rosterUnits.map((unit) => ({
      building: unit.building ?? 'Building',
      floor: unit.floor ?? 'Floor',
      id: unit.id,
      projectId: draft.project.id,
      unitNumber: unit.unitNumber,
      unitType: setupUnitType(unit.unitType),
    })),
    [draft.project.id, draft.units, rosterUnits],
  );

  const setProject = (
    field: 'endDate' | 'location' | 'propertyName' | 'startDate' | 'supervisorName',
    value: string,
  ) => {
    const nextProject = { ...draft.project, [field]: value };
    if (
      field === 'propertyName'
      && (!draft.project.name.trim() || draft.project.name === draft.project.propertyName)
    ) {
      nextProject.name = value;
    }
    onDraftChange({ ...draft, project: nextProject });
  };
  const setConfiguration = (configuration: ProjectConfiguration) => {
    onDraftChange({ ...draft, configuration });
  };
  const setPrimaryContact = (contactId: string) => {
    onDraftChange({
      ...draft,
      configuration: {
        ...draft.configuration,
        defaultPropertyContactId: contactId,
      },
      contacts: draft.contacts.map((contact) => ({
        ...contact,
        activeForProject: contact.id === contactId
          ? true
          : contact.activeForProject,
        isPrimary: contact.id === contactId,
      })),
    });
  };
  const setContactActive = (contactId: string, active: boolean) => {
    const nextContacts = replaceContact(
      draft.contacts,
      contactId,
      (contact) => ({ ...contact, activeForProject: active }),
    );
    const disabledPrimary = !active
      && nextContacts.some((contact) => contact.id === contactId && contact.isPrimary);
    const nextPrimaryId = disabledPrimary
      ? nextContacts.find((contact) =>
        contact.id !== contactId && contact.activeForProject !== false)?.id ?? ''
      : draft.configuration.defaultPropertyContactId;
    onDraftChange({
      ...draft,
      configuration: {
        ...draft.configuration,
        defaultPropertyContactId: nextPrimaryId,
      },
      contacts: nextContacts.map((contact) => ({
        ...contact,
        isPrimary: contact.id === nextPrimaryId,
      })),
    });
  };
  const setSetupCrews = (crews: readonly TrackASetupCrew[]) => {
    onDraftChange({
      ...draft,
      configuration: {
        ...draft.configuration,
        defaultCrewIdsByTrade: {
          clean: crews
            .filter((crew) => crew.active && crew.trade === 'clean')
            .map((crew) => crew.id),
          paint: crews
            .filter((crew) => crew.active && crew.trade === 'paint')
            .map((crew) => crew.id),
        },
      },
      crews,
    });
  };
  const updateSetupCrew = (
    crewId: string,
    update: (crew: TrackASetupCrew) => TrackASetupCrew,
  ) => {
    setSetupCrews(setupCrews.map((crew) => crew.id === crewId ? update(crew) : crew));
  };
  const addSetupCrew = (trade: TrackASetupCrew['trade']) => {
    const id = `crew:${draft.project.id}:${trade}:${Date.now()}:${setupCrews.length}`;
    setSetupCrews([
      ...setupCrews,
      {
        active: true,
        id,
        name: '',
        projectId: draft.project.id,
        trade,
      },
    ]);
  };
  const setSetupUnits = (units: readonly TrackASetupUnit[]) => {
    onDraftChange({ ...draft, units });
  };
  const addRosterUnits = () => {
    const parsed = unitPaste
      .split(/[\s,]+/u)
      .map((value) => value.trim())
      .filter(Boolean);
    const invalid = parsed.filter((value) => !/^[A-Za-z0-9-]+$/u.test(value));
    const existingNumbers = new Set(
      setupUnits.map((unit) => unit.unitNumber.toLocaleLowerCase()),
    );
    const uniqueNumbers = [...new Set(parsed.map((value) => value.toLocaleLowerCase()))]
      .map((normalized) => parsed.find(
        (value) => value.toLocaleLowerCase() === normalized,
      ))
      .filter((value): value is string => Boolean(value))
      .filter((value) => !existingNumbers.has(value.toLocaleLowerCase()));
    if (invalid.length > 0) {
      setRosterMessage(`Review unsupported Unit identifiers: ${invalid.join(', ')}`);
      return;
    }
    if (uniqueNumbers.length === 0) {
      setRosterMessage('No new Unit identifiers were found.');
      return;
    }
    setSetupUnits([
      ...setupUnits,
      ...uniqueNumbers.map((unitNumber): TrackASetupUnit => ({
        building: unitBuilding.trim()
          || `Building ${unitNumber.replace(/[^0-9]/gu, '').charAt(0) || '1'}`,
        floor: unitFloor.trim()
          || `Floor ${unitNumber.replace(/[^0-9]/gu, '').charAt(0) || '1'}`,
        id: `unit:${draft.project.id}:${encodeURIComponent(unitNumber.toLocaleLowerCase())}`,
        projectId: draft.project.id,
        unitNumber,
        unitType,
      })),
    ]);
    setUnitPaste('');
    setRosterMessage(
      `${uniqueNumbers.length} ${uniqueNumbers.length === 1 ? 'Unit' : 'Units'} added to the personal roster draft.`,
    );
  };
  const activeContacts = draft.contacts.filter(
    (contact) => contact.activeForProject !== false,
  );
  const configuredCrews = new Set([
    ...draft.configuration.defaultCrewIdsByTrade.paint,
    ...draft.configuration.defaultCrewIdsByTrade.clean,
  ]);
  const stepMissing: readonly (readonly string[])[] = [
    [
      ...draft.project.propertyName.trim() ? [] : ['Property name'],
      ...draft.project.location.trim() ? [] : ['Property location'],
      ...draft.project.startDate ? [] : ['Turn start date'],
      ...draft.project.endDate ? [] : ['Turn end date'],
      ...draft.project.startDate && draft.project.endDate
        && draft.project.startDate > draft.project.endDate
        ? ['Turn end date on or after the start date']
        : [],
      ...draft.project.supervisorName.trim() ? [] : ['Supervisor name'],
      ...draft.configuration.enabledTrades.paint
        || draft.configuration.enabledTrades.clean
        ? []
        : ['At least one trade (Paint or Clean)'],
    ],
    [
      ...activeContacts.some((contact) =>
        contact.isPrimary && contact.name.trim() && contact.title.trim())
        ? []
        : ['A primary property contact with a name and title'],
      ...schedule.workStartTime ? [] : ['Work start time (Default schedule)'],
      ...schedule.workEndTime ? [] : ['Work end time (Default schedule)'],
      ...schedule.walkthroughTime ? [] : ['Walkthrough time (Default schedule)'],
    ],
    [
      ...!draft.configuration.enabledTrades.paint || setupCrews.some((crew) =>
        crew.active && crew.trade === 'paint' && crew.name.trim())
        ? []
        : ['At least one active Paint crew'],
      ...!draft.configuration.enabledTrades.clean || setupCrews.some((crew) =>
        crew.active && crew.trade === 'clean' && crew.name.trim())
        ? []
        : ['At least one active Clean crew'],
    ],
    setupUnits.length > 0 ? [] : ['At least one Unit in the roster'],
    [],
  ];
  const stepComplete = stepMissing.map((missing) => missing.length === 0);
  const firstIncompleteStep = stepComplete.findIndex((complete) => !complete);
  const furthestAvailableStep = firstIncompleteStep < 0
    ? PROJECT_SETUP_STEPS.length - 1
    : firstIncompleteStep;

  return (
    <section
      aria-labelledby="w2a21a-setup-title"
      className="w2a21a-setup"
      data-track-a-project-setup="true"
    >
      <header className="w2a21a-setup__header">
        <div className="w2a21a-setup__title-row">
          <div>
            <p>Personal Turn OS setup</p>
            <h1 id="w2a21a-setup-title">Set up project</h1>
          </div>
          <button onClick={onExit} type="button">Close</button>
        </div>
        <p>Step {step + 1} of {PROJECT_SETUP_STEPS.length} · Paper remains authoritative.</p>
        <ol aria-label="Project setup progress" className="w2a21a-setup__steps">
          {PROJECT_SETUP_STEPS.map((item, index) => (
            <li aria-current={index === step ? 'step' : undefined} key={item.id}>
              <button
                aria-label={`Go to step ${index + 1}: ${item.label}`}
                disabled={index > furthestAvailableStep}
                onClick={() => {
                  setMissingNotice(null);
                  onStepChange(index);
                }}
                type="button"
              >
                <span>{index + 1}</span>
                {item.label}
              </button>
            </li>
          ))}
        </ol>
      </header>

      <div className="w2a21a-setup__body">
        {step === 0 ? (
          <fieldset>
            <legend>Property</legend>
            <label>
              Property name
              <input
                autoComplete="organization"
                onChange={(event) => setProject('propertyName', event.target.value)}
                value={draft.project.propertyName}
              />
            </label>
            <label>
              Property location
              <input
                autoComplete="street-address"
                onChange={(event) => setProject('location', event.target.value)}
                value={draft.project.location}
              />
            </label>
            <div className="w2a21a-setup__columns">
              <label>
                Turn start date
                <input
                  onChange={(event) => setProject('startDate', event.target.value)}
                  type="date"
                  value={draft.project.startDate}
                />
              </label>
              <label>
                Turn end date
                <input
                  onChange={(event) => setProject('endDate', event.target.value)}
                  type="date"
                  value={draft.project.endDate}
                />
              </label>
            </div>
            <label>
              Supervisor name
              <input
                autoComplete="name"
                onChange={(event) => setProject('supervisorName', event.target.value)}
                value={draft.project.supervisorName}
              />
            </label>
            <label>
              User role
              <select
                onChange={() => undefined}
                value={draft.configuration.role}
              >
                <option value="turn-supervisor">Turn supervisor</option>
              </select>
            </label>
            <fieldset className="w2a21a-setup__nested">
              <legend>Trades for this project</legend>
              <label className="w2a21a-setup__check">
                <input
                  checked={draft.configuration.enabledTrades.paint}
                  onChange={(event) => setConfiguration({
                    ...draft.configuration,
                    enabledTrades: {
                      ...draft.configuration.enabledTrades,
                      paint: event.target.checked,
                    },
                  })}
                  type="checkbox"
                />
                Paint
              </label>
              <label className="w2a21a-setup__check">
                <input
                  checked={draft.configuration.enabledTrades.clean}
                  onChange={(event) => setConfiguration({
                    ...draft.configuration,
                    enabledTrades: {
                      ...draft.configuration.enabledTrades,
                      clean: event.target.checked,
                    },
                  })}
                  type="checkbox"
                />
                Clean
              </label>
            </fieldset>
          </fieldset>
        ) : null}

        {step === 1 ? (
          <div className="w2a21a-setup__group-stack">
            <fieldset>
              <legend>Contacts</legend>
              <p className="w2a21a-setup__supporting">
                Keep Property Contacts separate from Paint and Clean crews.
              </p>
              {draft.contacts.length === 0 ? (
                <p>No Property Contacts are saved yet.</p>
              ) : null}
              {draft.contacts.map((contact) => (
                <div className="w2a21a-setup__contact" key={contact.id}>
                  <label>
                    Name
                    <input
                      autoComplete="name"
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        onDraftChange({
                          ...draft,
                          contacts: replaceContact(draft.contacts, contact.id, (current) => ({
                            ...current,
                            name: event.target.value,
                          })),
                        })}
                      value={contact.name}
                    />
                  </label>
                  <label>
                    Role
                    <select
                      onChange={(event) => {
                        const role = event.target.value as PropertyContactRole;
                        onDraftChange({
                          ...draft,
                          contacts: replaceContact(draft.contacts, contact.id, (current) => ({
                            ...current,
                            role,
                            title: role,
                          })),
                        });
                      }}
                      value={contactRole(contact)}
                    >
                      {PROPERTY_CONTACT_ROLES.map((role) => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Phone (optional)
                    <input
                      autoComplete="tel"
                      inputMode="tel"
                      onChange={(event) =>
                        onDraftChange({
                          ...draft,
                          contacts: replaceContact(draft.contacts, contact.id, (current) => ({
                            ...current,
                            phone: event.target.value,
                          })),
                        })}
                      value={contact.phone ?? ''}
                    />
                  </label>
                  <label>
                    Note (optional)
                    <textarea
                      onChange={(event) =>
                        onDraftChange({
                          ...draft,
                          contacts: replaceContact(draft.contacts, contact.id, (current) => ({
                            ...current,
                            note: event.target.value,
                          })),
                        })}
                      value={contact.note ?? ''}
                    />
                  </label>
                  <label className="w2a21a-setup__switch">
                    <input
                      checked={contact.activeForProject !== false}
                      onChange={(event) => setContactActive(contact.id, event.target.checked)}
                      type="checkbox"
                    />
                    <span>
                      <strong>Active for current project</strong>
                      <small>Available for Start Day and property walks.</small>
                    </span>
                  </label>
                  <label className="w2a21a-setup__check">
                    <input
                      checked={contact.isPrimary}
                      disabled={contact.activeForProject === false}
                      name="primary-property-contact"
                      onChange={() => setPrimaryContact(contact.id)}
                      type="radio"
                    />
                    Default daily contact
                  </label>
                  <button onClick={() => onRemoveContact(contact.id)} type="button">
                    Remove contact
                  </button>
                </div>
              ))}
              <button onClick={onAddContact} type="button">Add Property Contact</button>
            </fieldset>

            {/* Default schedule uses prefilled working defaults; editable from
                Start Day when it matters. */}
          </div>
        ) : null}

        {step === 3 ? (
          <fieldset>
            <legend>Property roster</legend>
            <p className="w2a21a-setup__supporting">
              Add the property roster once. This does not release work for today.
            </p>
            <div className="w2a21a-setup__roster-entry">
              <label>
                Unit numbers — paste the whole list at once
                <textarea
                  inputMode="numeric"
                  onChange={(event) => setUnitPaste(event.target.value)}
                  placeholder="101 102 103 201 202… (spaces, commas, or one per line)"
                  value={unitPaste}
                />
              </label>

              <label>
                Unit type
                <select
                  onChange={(event) => setUnitType(setupUnitType(event.target.value))}
                  value={unitType}
                >
                  {[1, 2, 3, 4, 5].map((count) => (
                    <option key={count} value={count}>
                      {count}BR · {unitTypeSections(setupUnitType(count)).join(', ')}
                    </option>
                  ))}
                </select>
              </label>
              <button onClick={addRosterUnits} type="button">Add Units</button>
              {rosterMessage ? (
                <p aria-live="polite" className="w2a21a-setup__supporting">
                  {rosterMessage}
                </p>
              ) : null}
            </div>
            <div className="w2a21a-setup__roster-summary">
              <strong>{setupUnits.length}</strong>
              <span>known {setupUnits.length === 1 ? 'Unit' : 'Units'}</span>
            </div>
            {setupUnits.length > 0 ? (
              <ul className="w2a21a-setup__roster">
                {setupUnits.map((unit) => (
                  <li key={unit.id}>
                    <span>
                      <strong>Unit {unit.unitNumber}</strong>
                      <small>
                        {unit.unitType}BR · {unit.building} · {unit.floor}
                      </small>
                    </span>
                    <span>
                      <span aria-label={`Applicable sections for Unit ${unit.unitNumber}`}>
                        {unitTypeSections(unit.unitType).join(', ')}
                      </span>
                      <button
                        aria-label={`Remove Unit ${unit.unitNumber}`}
                        onClick={() => setSetupUnits(
                          setupUnits.filter((candidate) => candidate.id !== unit.id),
                        )}
                        type="button"
                      >
                        Remove
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="w2a21a-setup__empty">
                <strong>No known Units are available to review.</strong>
                <p>Paste or type the Unit identifiers above.</p>
              </div>
            )}
            <div className="w2a21a-setup__notice" role="note">
              Exact identifiers are preserved. Image, PDF, and spreadsheet extraction are not included.
            </div>
          </fieldset>
        ) : null}

        {step === 2 ? (
          <div className="w2a21a-setup__group-stack">
            <fieldset>
              <legend>Crews</legend>
              {(['paint', 'clean'] as const).map((trade) => {
                const matchingCrews = setupCrews.filter((crew) => crew.trade === trade);
                return (
                  <div className="w2a21a-setup__crew-group" key={trade}>
                    <h2>{trade === 'paint' ? 'Paint crews' : 'Clean crews'}</h2>
                    {matchingCrews.length === 0 ? (
                      <p>No {trade} crews are saved yet.</p>
                    ) : matchingCrews.map((crew) => (
                      <div className="w2a21a-setup__crew-row" key={crew.id}>
                        <input
                          aria-label={`${trade === 'paint' ? 'Paint' : 'Clean'} crew name`}
                          onChange={(event) => updateSetupCrew(crew.id, (current) => ({
                            ...current,
                            name: event.target.value,
                          }))}
                          placeholder="Crew name"
                          value={crew.name}
                        />
                        <button
                          aria-label={`Remove ${crew.name || 'crew'}`}
                          onClick={() => setSetupCrews(
                            setupCrews.filter((candidate) => candidate.id !== crew.id),
                          )}
                          type="button"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button onClick={() => addSetupCrew(trade)} type="button">
                      Add {trade === 'paint' ? 'Paint' : 'Clean'} crew
                    </button>
                  </div>
                );
              })}
            </fieldset>

            {/* Personal-data permissions keep their safe defaults; the controls
                moved out of the first-run flow to keep Setup fast. */}
          </div>
        ) : null}

        {step === 4 ? (
          <fieldset>
            <legend>Review and activate</legend>
            <div className="w2a21a-setup__review-section">
              <div>
                <h2>Property</h2>
                <button onClick={() => onStepChange(0)} type="button">Edit Property</button>
              </div>
              <p>{draft.project.propertyName || 'Not set'} · {draft.project.startDate || 'No start date'} to {draft.project.endDate || 'No end date'}</p>
            </div>
            <div className="w2a21a-setup__review-section">
              <div>
                <h2>Contacts and schedule</h2>
                <button onClick={() => onStepChange(1)} type="button">Edit contacts and schedule</button>
              </div>
              <p>
                {activeContacts.length} active {activeContacts.length === 1 ? 'contact' : 'contacts'}
                {' · '}
                {schedule.workStartTime && schedule.workEndTime
                  ? `${schedule.workStartTime}–${schedule.workEndTime}`
                  : 'Work hours not set'}
                {' · '}
                {schedule.walkthroughTime
                  ? `Walkthrough ${schedule.walkthroughTime}`
                  : 'No default walkthrough'}
              </p>
            </div>
            <div className="w2a21a-setup__review-section">
              <div>
                <h2>Property roster</h2>
                <button onClick={() => onStepChange(3)} type="button">Review roster</button>
              </div>
              <p>{setupUnits.length} known {setupUnits.length === 1 ? 'Unit' : 'Units'}.</p>
            </div>
            <div className="w2a21a-setup__review-section">
              <div>
                <h2>Crews and permissions</h2>
                <button onClick={() => onStepChange(2)} type="button">Edit crews and permissions</button>
              </div>
              <p>
                {configuredCrews.size} default {configuredCrews.size === 1 ? 'crew' : 'crews'}
                {' · '}
                Photos: {draft.configuration.permissions.photos.replaceAll('-', ' ')}
              </p>
            </div>
            <dl className="w2a21a-setup__review">
              <div><dt>Role</dt><dd>Turn supervisor</dd></div>
              <div>
                <dt>Trades</dt>
                <dd>
                  {[
                    draft.configuration.enabledTrades.paint ? 'Paint' : '',
                    draft.configuration.enabledTrades.clean ? 'Clean' : '',
                  ].filter(Boolean).join(', ') || 'None selected'}
                </dd>
              </div>
              <div><dt>Authority</dt><dd>Paper TurnBoard remains authoritative</dd></div>
            </dl>
            {existingProjectRequiresConfirmation ? (
              <label className="w2a21a-setup__check w2a21a-setup__warning">
                <input
                  checked={draft.confirmOverwrite}
                  onChange={(event) => onDraftChange({
                    ...draft,
                    confirmOverwrite: event.target.checked,
                  })}
                  type="checkbox"
                />
                Replace the saved personal setup for this existing project.
              </label>
            ) : null}
            {activationErrors.length > 0 ? (
              <div className="w2a21a-setup__errors" role="alert">
                <strong>Project was not activated.</strong>
                <ul>{activationErrors.map((error) => <li key={error}>{error}</li>)}</ul>
              </div>
            ) : null}
            <button
              className="w2a21a-setup__primary"
              disabled={existingProjectRequiresConfirmation && !draft.confirmOverwrite}
              onClick={onActivate}
              type="button"
            >
              Activate Project
            </button>
            <p className="w2a21a-setup__supporting">
              Your project is saved on this device before activation completes.
            </p>
          </fieldset>
        ) : null}
      </div>

      {missingNotice && missingNotice.length > 0 ? (
        <div className="w2a21a-setup__errors w2a21a-setup__missing" role="alert">
          <strong>To continue, complete:</strong>
          <ul>{missingNotice.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      ) : null}
      <footer className="w2a21a-setup__footer">
        <button
          disabled={step === 0}
          onClick={() => {
            setMissingNotice(null);
            onStepChange(step - 1);
          }}
          type="button"
        >
          Back
        </button>
        {step < PROJECT_SETUP_STEPS.length - 1 ? (
          <button
            className="w2a21a-setup__primary"
            onClick={() => {
              if (stepComplete[step]) {
                setMissingNotice(null);
                onStepChange(step + 1);
                return;
              }
              setMissingNotice(stepMissing[step]);
            }}
            type="button"
          >
            Continue
          </button>
        ) : null}
      </footer>
    </section>
  );
}
