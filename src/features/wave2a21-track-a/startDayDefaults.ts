import type {
  ProjectConfiguration,
  PropertyContact,
  StartDaySavedDefaults,
} from './contracts';

export const START_DAY_EIGHT_STEP_CONTRACT = Object.freeze([
  { id: 'property-day', label: 'Confirm project and day' },
  { id: 'property-contact', label: 'Confirm property contact' },
  { id: 'access', label: 'Confirm keys and access' },
  { id: 'released-work', label: 'Review today’s confirmed release' },
  { id: 'active-crews', label: 'Confirm active Paint and Clean crews' },
  { id: 'day-defaults', label: 'Review hours and walkthrough defaults' },
  { id: 'morning-note', label: 'Add an optional morning note' },
  { id: 'review-start', label: 'Review and Start Day' },
] as const);

export interface StartDayDefaultOverrides {
  readonly activeCrewIdsByTrade?: Partial<StartDaySavedDefaults['activeCrewIdsByTrade']>;
  readonly propertyContactId?: string;
  readonly walkthroughScheduleWording?: string;
  readonly workingHoursWording?: string;
}

const unique = (values: readonly string[]) => [...new Set(values)];

export function createStartDaySavedDefaults(
  configuration: ProjectConfiguration,
  contacts: readonly PropertyContact[],
  overrides: StartDayDefaultOverrides = {},
): StartDaySavedDefaults {
  const selectedContactId = overrides.propertyContactId
    ?? configuration.defaultPropertyContactId;
  const selectedContact = contacts.find((contact) =>
    contact.projectId === configuration.projectId
    && contact.id === selectedContactId);
  if (!selectedContact) {
    throw new Error('The saved Start Day property contact is unavailable.');
  }

  const workingHoursWording = (
    overrides.workingHoursWording
    ?? configuration.defaultWorkingHoursWording
  ).trim();
  const walkthroughScheduleWording = (
    overrides.walkthroughScheduleWording
    ?? configuration.defaultWalkthroughScheduleWording
  ).trim();
  if (!workingHoursWording || !walkthroughScheduleWording) {
    throw new Error('Start Day requires working-hours and walkthrough wording.');
  }

  return {
    activeCrewIdsByTrade: {
      Clean: configuration.enabledTrades.clean
        ? unique(
          overrides.activeCrewIdsByTrade?.Clean
          ?? configuration.defaultCrewIdsByTrade.clean,
        )
        : [],
      Paint: configuration.enabledTrades.paint
        ? unique(
          overrides.activeCrewIdsByTrade?.Paint
          ?? configuration.defaultCrewIdsByTrade.paint,
        )
        : [],
    },
    propertyContact: selectedContact.name,
    propertyContactId: selectedContact.id,
    walkthroughScheduleWording,
    workingHoursWording,
  };
}

export function getStartDayStepContract() {
  return START_DAY_EIGHT_STEP_CONTRACT.map((step) => ({ ...step }));
}

export const projectStartDaySavedDefaults = createStartDaySavedDefaults;
