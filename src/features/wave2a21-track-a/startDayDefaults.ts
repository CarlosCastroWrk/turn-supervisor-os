import type {
  ProjectConfiguration,
  PropertyContact,
  StartDayResolvedValue,
  StartDayResolvedValues,
  StartDayValueSource,
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
  readonly activeCrewIdsByTrade?: {
    readonly Paint?: readonly string[];
    readonly Clean?: readonly string[];
  };
  readonly propertyContactId?: string;
  readonly walkthroughScheduleWording?: string;
  readonly workingHoursWording?: string;
}

const unique = (values: readonly string[]) => [...new Set(values)];
const SAVED_PROJECT_DEFAULT: StartDayValueSource = 'saved-project-default';
const TODAY_ONLY_OVERRIDE: StartDayValueSource = 'today-only-override';

const resolvedValue = <T,>(
  value: T,
  overridden: boolean,
): StartDayResolvedValue<T> => ({
  source: overridden ? TODAY_ONLY_OVERRIDE : SAVED_PROJECT_DEFAULT,
  value,
});

export function resolveStartDayValues(
  configuration: ProjectConfiguration,
  contacts: readonly PropertyContact[],
  overrides: StartDayDefaultOverrides = {},
): StartDayResolvedValues {
  const propertyContactOverridden = overrides.propertyContactId !== undefined;
  const selectedContactId = overrides.propertyContactId
    ?? configuration.defaultPropertyContactId;
  const selectedContact = contacts.find((contact) =>
    contact.projectId === configuration.projectId
    && contact.id === selectedContactId);
  if (!selectedContact) {
    throw new Error('The saved Start Day property contact is unavailable.');
  }

  const workingHoursOverridden = overrides.workingHoursWording !== undefined;
  const walkthroughOverridden = overrides.walkthroughScheduleWording !== undefined;
  const paintCrewsOverridden = overrides.activeCrewIdsByTrade?.Paint !== undefined;
  const cleanCrewsOverridden = overrides.activeCrewIdsByTrade?.Clean !== undefined;
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
      Clean: resolvedValue(
        configuration.enabledTrades.clean
          ? unique(
            overrides.activeCrewIdsByTrade?.Clean
            ?? configuration.defaultCrewIdsByTrade.clean,
          )
          : [],
        configuration.enabledTrades.clean && cleanCrewsOverridden,
      ),
      Paint: resolvedValue(
        configuration.enabledTrades.paint
          ? unique(
            overrides.activeCrewIdsByTrade?.Paint
            ?? configuration.defaultCrewIdsByTrade.paint,
          )
          : [],
        configuration.enabledTrades.paint && paintCrewsOverridden,
      ),
    },
    propertyContact: resolvedValue({
      id: selectedContact.id,
      name: selectedContact.name,
    }, propertyContactOverridden),
    walkthroughScheduleWording: resolvedValue(
      walkthroughScheduleWording,
      walkthroughOverridden,
    ),
    workingHoursWording: resolvedValue(
      workingHoursWording,
      workingHoursOverridden,
    ),
  };
}

export function getStartDayStepContract() {
  return START_DAY_EIGHT_STEP_CONTRACT.map((step) => ({ ...step }));
}
