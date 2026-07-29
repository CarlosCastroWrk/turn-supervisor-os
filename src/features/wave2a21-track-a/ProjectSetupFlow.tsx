import type { ChangeEvent } from 'react';
import type {
  BrowserPermissionState,
  ProjectActivationDraft,
  ProjectConfiguration,
  ProjectRosterUnitOption,
  PropertyContact,
  PropertyContactRole,
  TrackACrewOption,
} from './contracts';
import { PROPERTY_CONTACT_ROLES } from './contracts';
import {
  configurationWithSchedule,
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

const sectionLabel = (section: ProjectRosterUnitOption['applicableSections'][number]) =>
  section === 'common' ? 'Common' : section;

const permissionCopy: Readonly<Record<BrowserPermissionState, string>> = {
  denied: 'Denied by this browser or device',
  granted: 'Granted by this browser or device',
  prompt: 'Not decided by this browser or device',
  unknown: 'Not checked by this component',
  unsupported: 'Unavailable in this browser',
};

export function ProjectSetupFlow({
  activationErrors = [],
  cameraPermissionState = 'unknown',
  crewOptions = [],
  currentStep,
  draft,
  existingProjectRequiresConfirmation = false,
  onActivate,
  onAddContact,
  onDraftChange,
  onRemoveContact,
  onStepChange,
  rosterUnits = [],
}: ProjectSetupFlowProps) {
  const step = clampProjectSetupStep(currentStep);
  const schedule = resolveProjectDefaultSchedule(draft.configuration);

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
  const setSchedule = (
    field: 'walkthroughTime' | 'workEndTime' | 'workStartTime',
    value: string,
  ) => {
    setConfiguration(configurationWithSchedule(draft.configuration, {
      ...schedule,
      [field]: value || undefined,
    }));
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
  const setCrewEnabled = (crew: ProjectSetupCrewOption, checked: boolean) => {
    const current = draft.configuration.defaultCrewIdsByTrade[crew.trade];
    const nextIds = checked
      ? [...new Set([...current, crew.id])]
      : current.filter((crewId) => crewId !== crew.id);
    setConfiguration({
      ...draft.configuration,
      defaultCrewIdsByTrade: {
        ...draft.configuration.defaultCrewIdsByTrade,
        [crew.trade]: nextIds,
      },
    });
  };
  const activeContacts = draft.contacts.filter(
    (contact) => contact.activeForProject !== false,
  );
  const configuredCrews = new Set([
    ...draft.configuration.defaultCrewIdsByTrade.paint,
    ...draft.configuration.defaultCrewIdsByTrade.clean,
  ]);

  return (
    <section
      aria-labelledby="w2a21a-setup-title"
      className="w2a21a-setup"
      data-track-a-project-setup="true"
    >
      <header className="w2a21a-setup__header">
        <p>Personal Turn OS setup</p>
        <h1 id="w2a21a-setup-title">Set up project</h1>
        <p>
          Step {step + 1} of {PROJECT_SETUP_STEPS.length}. The paper TurnBoard remains authoritative.
        </p>
        <ol aria-label="Project setup progress" className="w2a21a-setup__steps">
          {PROJECT_SETUP_STEPS.map((item, index) => (
            <li aria-current={index === step ? 'step' : undefined} key={item.id}>
              <button
                aria-label={`Go to step ${index + 1}: ${item.label}`}
                onClick={() => onStepChange(index)}
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

            <fieldset>
              <legend>Default schedule</legend>
              <div className="w2a21a-setup__columns">
                <label>
                  Default work start
                  <input
                    onChange={(event) => setSchedule('workStartTime', event.target.value)}
                    type="time"
                    value={schedule.workStartTime}
                  />
                </label>
                <label>
                  Default work end
                  <input
                    onChange={(event) => setSchedule('workEndTime', event.target.value)}
                    type="time"
                    value={schedule.workEndTime}
                  />
                </label>
              </div>
              <label>
                Default walkthrough time (optional)
                <input
                  onChange={(event) => setSchedule('walkthroughTime', event.target.value)}
                  type="time"
                  value={schedule.walkthroughTime ?? ''}
                />
              </label>
              <p className="w2a21a-setup__supporting">
                Start Day reuses these defaults. A one-day change does not rewrite them.
              </p>
            </fieldset>
          </div>
        ) : null}

        {step === 2 ? (
          <fieldset>
            <legend>Property roster</legend>
            <p className="w2a21a-setup__supporting">
              Review the known Units already attached to this personal project. This is not today’s release.
            </p>
            <div className="w2a21a-setup__roster-summary">
              <strong>{rosterUnits.length}</strong>
              <span>known {rosterUnits.length === 1 ? 'Unit' : 'Units'}</span>
            </div>
            {rosterUnits.length > 0 ? (
              <ul className="w2a21a-setup__roster">
                {rosterUnits.map((unit) => (
                  <li key={unit.id}>
                    <span>
                      <strong>Unit {unit.unitNumber}</strong>
                      <small>
                        {unit.unitType}
                        {unit.building ? ` · ${unit.building}` : ''}
                        {unit.floor ? ` · ${unit.floor}` : ''}
                      </small>
                    </span>
                    <span aria-label={`Applicable sections for Unit ${unit.unitNumber}`}>
                      {unit.applicableSections.map(sectionLabel).join(', ') || 'No applicable sections'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="w2a21a-setup__empty">
                <strong>No known Units are available to review.</strong>
                <p>Add Units through an already accepted manual roster flow before activation.</p>
              </div>
            )}
            <div className="w2a21a-setup__notice" role="note">
              Advanced file and image import is not included in this candidate.
            </div>
          </fieldset>
        ) : null}

        {step === 3 ? (
          <div className="w2a21a-setup__group-stack">
            <fieldset>
              <legend>Crews</legend>
              {(['paint', 'clean'] as const).map((trade) => {
                const matchingCrews = crewOptions.filter((crew) => crew.trade === trade);
                return (
                  <div className="w2a21a-setup__crew-group" key={trade}>
                    <h2>{trade === 'paint' ? 'Paint crews' : 'Clean crews'}</h2>
                    {matchingCrews.length === 0 ? (
                      <p>No {trade} crews are saved yet.</p>
                    ) : matchingCrews.map((crew) => (
                      <label className="w2a21a-setup__check" key={crew.id}>
                        <input
                          checked={draft.configuration.defaultCrewIdsByTrade[trade].includes(crew.id)}
                          disabled={crew.active === false}
                          onChange={(event) => setCrewEnabled(crew, event.target.checked)}
                          type="checkbox"
                        />
                        {crew.name}{crew.active === false ? ' · Inactive' : ''}
                      </label>
                    ))}
                  </div>
                );
              })}
            </fieldset>

            <fieldset>
              <legend>Personal data and permissions</legend>
              <label>
                Personal photo rule
                <select
                  onChange={(event) => setConfiguration({
                    ...draft.configuration,
                    permissions: {
                      ...draft.configuration.permissions,
                      photos: event.target.value as ProjectConfiguration['permissions']['photos'],
                    },
                  })}
                  value={draft.configuration.permissions.photos}
                >
                  <option value="not-confirmed">Permission not confirmed</option>
                  <option value="permitted">Los confirmed permission outside the app</option>
                  <option value="prohibited">Do not store photos</option>
                </select>
              </label>
              <dl className="w2a21a-setup__permission-state">
                <div>
                  <dt>Browser camera permission</dt>
                  <dd>{permissionCopy[cameraPermissionState]}</dd>
                </div>
              </dl>
              <div className="w2a21a-setup__notice" role="note">
                This records a personal reminder only. It does not request or grant property,
                PDS, camera, or photo permission.
              </div>
            </fieldset>
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
                <button onClick={() => onStepChange(2)} type="button">Review roster</button>
              </div>
              <p>{rosterUnits.length} known {rosterUnits.length === 1 ? 'Unit' : 'Units'}.</p>
            </div>
            <div className="w2a21a-setup__review-section">
              <div>
                <h2>Crews and permissions</h2>
                <button onClick={() => onStepChange(3)} type="button">Edit crews and permissions</button>
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
              Activation is complete only after the host confirms durable local persistence.
            </p>
          </fieldset>
        ) : null}
      </div>

      <footer className="w2a21a-setup__footer">
        <button
          disabled={step === 0}
          onClick={() => onStepChange(step - 1)}
          type="button"
        >
          Back
        </button>
        {step < PROJECT_SETUP_STEPS.length - 1 ? (
          <button
            className="w2a21a-setup__primary"
            onClick={() => onStepChange(step + 1)}
            type="button"
          >
            Continue
          </button>
        ) : null}
      </footer>
    </section>
  );
}
