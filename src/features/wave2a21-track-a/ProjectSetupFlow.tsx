import type { ChangeEvent } from 'react';
import type {
  ProjectActivationDraft,
  ProjectConfiguration,
  PropertyContact,
} from './contracts';
import './trackA.css';

export const PROJECT_SETUP_STEPS = Object.freeze([
  { id: 'project', label: 'Project' },
  { id: 'role-trades', label: 'Role and trades' },
  { id: 'daily-defaults', label: 'Daily defaults' },
  { id: 'contacts', label: 'Property contacts' },
  { id: 'review', label: 'Review and activate' },
] as const);

export interface ProjectSetupCrewOption {
  readonly id: string;
  readonly name: string;
  readonly trade: 'paint' | 'clean';
}

export interface ProjectSetupFlowProps {
  readonly activationErrors?: readonly string[];
  readonly crewOptions?: readonly ProjectSetupCrewOption[];
  readonly currentStep: number;
  readonly draft: ProjectActivationDraft;
  readonly existingProjectRequiresConfirmation?: boolean;
  readonly onActivate: () => void;
  readonly onAddContact: () => void;
  readonly onDraftChange: (draft: ProjectActivationDraft) => void;
  readonly onRemoveContact: (contactId: string) => void;
  readonly onStepChange: (step: number) => void;
}

const replaceContact = (
  contacts: readonly PropertyContact[],
  contactId: string,
  update: (contact: PropertyContact) => PropertyContact,
) => contacts.map((contact) => contact.id === contactId ? update(contact) : contact);

export function ProjectSetupFlow({
  activationErrors = [],
  crewOptions = [],
  currentStep,
  draft,
  existingProjectRequiresConfirmation = false,
  onActivate,
  onAddContact,
  onDraftChange,
  onRemoveContact,
  onStepChange,
}: ProjectSetupFlowProps) {
  const step = Math.max(0, Math.min(PROJECT_SETUP_STEPS.length - 1, currentStep));
  const setProject = (
    field: 'endDate' | 'location' | 'name' | 'propertyName' | 'startDate' | 'supervisorName',
    value: string,
  ) => {
    onDraftChange({
      ...draft,
      project: { ...draft.project, [field]: value },
    });
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
        isPrimary: contact.id === contactId,
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

  return (
    <section
      aria-labelledby="w2a21a-setup-title"
      className="w2a21a-setup"
      data-track-a-project-setup="true"
    >
      <header className="w2a21a-setup__header">
        <p>Personal Turn OS setup</p>
        <h1 id="w2a21a-setup-title">Activate project</h1>
        <p>
          Step {step + 1} of {PROJECT_SETUP_STEPS.length}. The paper TurnBoard remains authoritative.
        </p>
        <ol aria-label="Project setup progress" className="w2a21a-setup__steps">
          {PROJECT_SETUP_STEPS.map((item, index) => (
            <li aria-current={index === step ? 'step' : undefined} key={item.id}>
              <button onClick={() => onStepChange(index)} type="button">
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
            <legend>Project</legend>
            <label>
              Project name
              <input
                onChange={(event) => setProject('name', event.target.value)}
                value={draft.project.name}
              />
            </label>
            <label>
              Property name
              <input
                onChange={(event) => setProject('propertyName', event.target.value)}
                value={draft.project.propertyName}
              />
            </label>
            <label>
              Location
              <input
                onChange={(event) => setProject('location', event.target.value)}
                value={draft.project.location}
              />
            </label>
            <div className="w2a21a-setup__columns">
              <label>
                Start date
                <input
                  onChange={(event) => setProject('startDate', event.target.value)}
                  type="date"
                  value={draft.project.startDate}
                />
              </label>
              <label>
                End date
                <input
                  onChange={(event) => setProject('endDate', event.target.value)}
                  type="date"
                  value={draft.project.endDate}
                />
              </label>
            </div>
          </fieldset>
        ) : null}

        {step === 1 ? (
          <fieldset>
            <legend>Role and trades</legend>
            <label>
              Los’s role
              <input readOnly value="Turn supervisor" />
            </label>
            <label>
              Supervisor name
              <input
                onChange={(event) => setProject('supervisorName', event.target.value)}
                value={draft.project.supervisorName}
              />
            </label>
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
        ) : null}

        {step === 2 ? (
          <fieldset>
            <legend>Daily defaults</legend>
            <label>
              Working hours
              <textarea
                onChange={(event) => setConfiguration({
                  ...draft.configuration,
                  defaultWorkingHoursWording: event.target.value,
                })}
                value={draft.configuration.defaultWorkingHoursWording}
              />
            </label>
            <label>
              Daily walkthrough
              <textarea
                onChange={(event) => setConfiguration({
                  ...draft.configuration,
                  defaultWalkthroughScheduleWording: event.target.value,
                })}
                value={draft.configuration.defaultWalkthroughScheduleWording}
              />
            </label>
            {(['paint', 'clean'] as const).map((trade) => (
              <div className="w2a21a-setup__crew-group" key={trade}>
                <h2>{trade === 'paint' ? 'Default Paint crews' : 'Default Clean crews'}</h2>
                {crewOptions.filter((crew) => crew.trade === trade).length === 0 ? (
                  <p>No {trade} crews are available yet. Confirm them during Start Day.</p>
                ) : crewOptions.filter((crew) => crew.trade === trade).map((crew) => (
                  <label className="w2a21a-setup__check" key={crew.id}>
                    <input
                      checked={draft.configuration.defaultCrewIdsByTrade[trade].includes(crew.id)}
                      onChange={(event) => setCrewEnabled(crew, event.target.checked)}
                      type="checkbox"
                    />
                    {crew.name}
                  </label>
                ))}
              </div>
            ))}
          </fieldset>
        ) : null}

        {step === 3 ? (
          <fieldset>
            <legend>Property contacts</legend>
            {draft.contacts.map((contact) => (
              <div className="w2a21a-setup__contact" key={contact.id}>
                <label>
                  Name
                  <input
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
                  Title
                  <input
                    onChange={(event) =>
                      onDraftChange({
                        ...draft,
                        contacts: replaceContact(draft.contacts, contact.id, (current) => ({
                          ...current,
                          title: event.target.value,
                        })),
                      })}
                    value={contact.title}
                  />
                </label>
                <label>
                  Phone (optional)
                  <input
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
                <label className="w2a21a-setup__check">
                  <input
                    checked={contact.isPrimary}
                    name="primary-property-contact"
                    onChange={() => setPrimaryContact(contact.id)}
                    type="radio"
                  />
                  Primary daily contact
                </label>
                <button onClick={() => onRemoveContact(contact.id)} type="button">
                  Remove contact
                </button>
              </div>
            ))}
            <button onClick={onAddContact} type="button">Add property contact</button>
          </fieldset>
        ) : null}

        {step === 4 ? (
          <fieldset>
            <legend>Review and activate</legend>
            <dl className="w2a21a-setup__review">
              <div><dt>Project</dt><dd>{draft.project.propertyName || 'Not set'}</dd></div>
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
              <div><dt>Contacts</dt><dd>{draft.contacts.length}</dd></div>
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
              Activate personal project
            </button>
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
