import type {
  DailyReleaseBatch,
  DailyReleaseItem,
  DaySessionKeyStatus,
  FieldSection,
  FieldTrade,
} from '../../types';
import type {
  ProjectConfiguration,
  ProjectDefaultSchedule,
  ProjectRosterUnitOption,
  PropertyContact,
  TrackACrewOption,
} from './contracts';

export const FAST_START_DAY_STEPS = Object.freeze([
  { id: 'day-access', label: 'Day and access' },
  { id: 'daily-release', label: 'Daily release' },
  { id: 'crews-defaults', label: 'Crews and defaults' },
  { id: 'review-start', label: 'Review and Start Day' },
] as const);

export const clampFastStartDayStep = (step: number) => (
  Number.isFinite(step)
    ? Math.max(0, Math.min(FAST_START_DAY_STEPS.length - 1, Math.trunc(step)))
    : 0
);

export const DAILY_RELEASE_TRADE_CHOICES = ['Paint', 'Clean', 'Both'] as const;
export type DailyReleaseTradeChoice =
  (typeof DAILY_RELEASE_TRADE_CHOICES)[number];

export const DAILY_RELEASE_EXCEPTION_KINDS = [
  'unreleased-bedroom',
  'occupied-restricted',
  'added-scope',
  'access-issue',
] as const;
export type DailyReleaseExceptionKind =
  (typeof DAILY_RELEASE_EXCEPTION_KINDS)[number];

export const DAILY_RELEASE_EXCEPTION_LABELS:
Readonly<Record<DailyReleaseExceptionKind, string>> = {
  'access-issue': 'Access issue',
  'added-scope': 'Added scope',
  'occupied-restricted': 'Occupied/restricted section',
  'unreleased-bedroom': 'Unreleased bedroom',
};

export interface DailyReleaseException {
  readonly kind: DailyReleaseExceptionKind;
  readonly section: FieldSection;
  readonly unitId: string;
}

export interface DailyReleaseDraft {
  readonly exceptions: readonly DailyReleaseException[];
  readonly explicitConfirmation: boolean;
  readonly selectedUnitIds: readonly string[];
  readonly tradeChoice: DailyReleaseTradeChoice;
}

export interface PreparedDailyReleaseItem {
  readonly restriction?: string;
  readonly section: FieldSection;
  readonly trade: FieldTrade;
  readonly unitId: string;
  readonly unitNumber: string;
}

export interface PreparedDailyReleasePlan {
  readonly contactId: string;
  readonly contactName: string;
  readonly date: string;
  readonly exceptions: readonly DailyReleaseException[];
  readonly explicitConfirmation: true;
  readonly items: readonly PreparedDailyReleaseItem[];
  readonly projectId: string;
  readonly rosterFingerprint: string;
  readonly selectedUnitIds: readonly string[];
  readonly sourceLabel: 'Manual selection in personal Turn OS';
  readonly tradeChoice: DailyReleaseTradeChoice;
}

export type DailyReleasePreparationResult =
  | {
      readonly ok: true;
      readonly plan: PreparedDailyReleasePlan;
    }
  | {
      readonly ok: false;
      readonly errors: readonly string[];
    };

export interface DailyReleaseBatchContext {
  readonly batchId: string;
  readonly confirmedAt: string;
  readonly confirmedBy: string;
}

export interface FastStartDaySubmission {
  readonly activeCrewIdsByTrade: {
    readonly clean: readonly string[];
    readonly paint: readonly string[];
  };
  readonly date: string;
  readonly explicitStartConfirmation: true;
  readonly keyStatus: DaySessionKeyStatus;
  readonly morningNote: string;
  readonly projectId: string;
  readonly propertyContact: {
    readonly id: string;
    readonly name: string;
  };
  readonly propertyName: string;
  readonly release: PreparedDailyReleasePlan;
  readonly schedule: ProjectDefaultSchedule;
}

export type FastStartDayPreparationResult =
  | {
      readonly ok: true;
      readonly submission: FastStartDaySubmission;
    }
  | {
      readonly ok: false;
      readonly errors: readonly string[];
    };

export interface PrepareFastStartDayInput {
  readonly activeCrewIdsByTrade: {
    readonly clean: readonly string[];
    readonly paint: readonly string[];
  };
  readonly contacts: readonly PropertyContact[];
  readonly crewOptions: readonly TrackACrewOption[];
  readonly date: string;
  readonly enabledTrades: ProjectConfiguration['enabledTrades'];
  readonly explicitStartConfirmation: boolean;
  readonly keyStatus?: DaySessionKeyStatus;
  readonly morningNote?: string;
  readonly projectId: string;
  readonly propertyContactId: string;
  readonly propertyName: string;
  readonly releaseDraft: DailyReleaseDraft;
  readonly rosterUnits: readonly ProjectRosterUnitOption[];
  readonly schedule: ProjectDefaultSchedule;
}

const TIME_VALUE_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;
const unique = <T,>(values: readonly T[]) => [...new Set(values)];
const sectionOrder: readonly FieldSection[] = ['common', 'A', 'B', 'C', 'D', 'E'];

export const isValidTimeValue = (value: string) =>
  TIME_VALUE_PATTERN.test(value);

export const formatWorkingHoursWording = (
  workStartTime: string,
  workEndTime: string,
) => (
  isValidTimeValue(workStartTime) && isValidTimeValue(workEndTime)
    ? `${workStartTime}–${workEndTime}`
    : ''
);

export const formatWalkthroughScheduleWording = (walkthroughTime?: string) => (
  walkthroughTime && isValidTimeValue(walkthroughTime)
    ? walkthroughTime
    : 'Not scheduled'
);

export function configurationWithSchedule(
  configuration: ProjectConfiguration,
  schedule: ProjectDefaultSchedule,
): ProjectConfiguration {
  return {
    ...configuration,
    defaultWalkthroughScheduleWording:
      formatWalkthroughScheduleWording(schedule.walkthroughTime),
    defaultWorkingHoursWording:
      formatWorkingHoursWording(schedule.workStartTime, schedule.workEndTime),
  };
}

export function resolveProjectDefaultSchedule(
  configuration: ProjectConfiguration,
): ProjectDefaultSchedule {
  const workingTimes = configuration.defaultWorkingHoursWording
    .match(/\b(?:[01]\d|2[0-3]):[0-5]\d\b/gu) ?? [];
  const walkthroughTime = configuration.defaultWalkthroughScheduleWording
    .match(/\b(?:[01]\d|2[0-3]):[0-5]\d\b/u)?.[0];
  return {
    workEndTime: workingTimes[1] ?? '',
    workStartTime: workingTimes[0] ?? '',
    walkthroughTime,
  };
}

export const createDailyReleaseDraft = (
  tradeChoice: DailyReleaseTradeChoice = 'Both',
): DailyReleaseDraft => ({
  exceptions: [],
  explicitConfirmation: false,
  selectedUnitIds: [],
  tradeChoice,
});

export function setDailyReleaseUnitSelected(
  draft: DailyReleaseDraft,
  unitId: string,
  selected: boolean,
): DailyReleaseDraft {
  const selectedUnitIds = selected
    ? unique([...draft.selectedUnitIds, unitId])
    : draft.selectedUnitIds.filter((candidate) => candidate !== unitId);
  return {
    ...draft,
    exceptions: selected
      ? draft.exceptions
      : draft.exceptions.filter((exception) => exception.unitId !== unitId),
    explicitConfirmation: false,
    selectedUnitIds,
  };
}

export function setDailyReleaseException(
  draft: DailyReleaseDraft,
  unitId: string,
  section: FieldSection,
  kind?: DailyReleaseExceptionKind,
): DailyReleaseDraft {
  const retained = draft.exceptions.filter((exception) =>
    exception.unitId !== unitId || exception.section !== section);
  return {
    ...draft,
    exceptions: kind ? [...retained, { kind, section, unitId }] : retained,
    explicitConfirmation: false,
  };
}

export const tradeChoiceToTrades = (
  choice: DailyReleaseTradeChoice,
): readonly FieldTrade[] => {
  if (choice === 'Paint') return ['paint'];
  if (choice === 'Clean') return ['clean'];
  return ['paint', 'clean'];
};

export function availableDailyReleaseTradeChoices(
  enabledTrades: ProjectConfiguration['enabledTrades'],
): readonly DailyReleaseTradeChoice[] {
  if (enabledTrades.paint && enabledTrades.clean) {
    return DAILY_RELEASE_TRADE_CHOICES;
  }
  if (enabledTrades.paint) return ['Paint'];
  if (enabledTrades.clean) return ['Clean'];
  return [];
}

const rosterFingerprint = (
  rosterUnits: readonly ProjectRosterUnitOption[],
) => JSON.stringify(
  [...rosterUnits]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((unit) => ({
      applicableSections: [...unit.applicableSections].sort(
        (left, right) => sectionOrder.indexOf(left) - sectionOrder.indexOf(right),
      ),
      id: unit.id,
      unitNumber: unit.unitNumber,
      unitType: unit.unitType,
    })),
);

const exceptionRestriction = (
  kind?: DailyReleaseExceptionKind,
): string | undefined => {
  if (kind === 'access-issue') return 'Access issue';
  if (kind === 'added-scope') return 'Added scope — verify scope';
  return undefined;
};

const blocksRelease = (kind?: DailyReleaseExceptionKind) => (
  kind === 'unreleased-bedroom' || kind === 'occupied-restricted'
);

export function prepareDailyReleasePlan(input: {
  readonly contacts: readonly PropertyContact[];
  readonly date: string;
  readonly draft: DailyReleaseDraft;
  readonly enabledTrades?: ProjectConfiguration['enabledTrades'];
  readonly projectId: string;
  readonly propertyContactId: string;
  readonly rosterUnits: readonly ProjectRosterUnitOption[];
}): DailyReleasePreparationResult {
  const errors: string[] = [];
  const contact = input.contacts.find((candidate) =>
    candidate.id === input.propertyContactId
    && candidate.projectId === input.projectId
    && candidate.activeForProject !== false);
  if (!contact) errors.push('Select an active Property Contact for today.');
  if (!input.date) errors.push('A field date is required.');
  if (!input.draft.explicitConfirmation) {
    errors.push('Review and explicitly confirm today’s release.');
  }
  const enabledTradeChoices = availableDailyReleaseTradeChoices(
    input.enabledTrades ?? { clean: true, paint: true },
  );
  if (!enabledTradeChoices.includes(input.draft.tradeChoice)) {
    errors.push(`${input.draft.tradeChoice} is not enabled for this project.`);
  }

  const rosterById = new Map(
    input.rosterUnits.map((unit) => [unit.id, unit] as const),
  );
  const selectedUnitIds = unique(input.draft.selectedUnitIds);
  if (selectedUnitIds.length === 0) {
    errors.push('Select at least one Unit for today’s release.');
  }
  for (const unitId of selectedUnitIds) {
    if (!rosterById.has(unitId)) {
      errors.push(`Unit ${unitId} is no longer in the current Property roster.`);
    }
  }

  const exceptionKeys = new Set<string>();
  for (const exception of input.draft.exceptions) {
    const key = `${exception.unitId}:${exception.section}`;
    if (exceptionKeys.has(key)) {
      errors.push(`Unit ${exception.unitId} ${exception.section} has conflicting exceptions.`);
    }
    exceptionKeys.add(key);
    const unit = rosterById.get(exception.unitId);
    if (
      !selectedUnitIds.includes(exception.unitId)
      || !unit?.applicableSections.includes(exception.section)
    ) {
      errors.push(`An exception targets unavailable scope: ${key}.`);
    }
  }
  if (errors.length > 0) return { errors, ok: false };

  const exceptionByTarget = new Map(
    input.draft.exceptions.map((exception) => [
      `${exception.unitId}:${exception.section}`,
      exception.kind,
    ] as const),
  );
  const trades = tradeChoiceToTrades(input.draft.tradeChoice);
  const items = selectedUnitIds.flatMap((unitId) => {
    const unit = rosterById.get(unitId);
    if (!unit) return [];
    return unit.applicableSections.flatMap((section) => {
      const exception = exceptionByTarget.get(`${unit.id}:${section}`);
      if (blocksRelease(exception)) return [];
      return trades.map((trade): PreparedDailyReleaseItem => ({
        restriction: exceptionRestriction(exception),
        section,
        trade,
        unitId: unit.id,
        unitNumber: unit.unitNumber,
      }));
    });
  });
  if (items.length === 0) {
    return {
      errors: ['The selected exceptions leave no confirmed work to release.'],
      ok: false,
    };
  }

  return {
    ok: true,
    plan: {
      contactId: contact!.id,
      contactName: contact!.name,
      date: input.date,
      exceptions: input.draft.exceptions.map((exception) => ({ ...exception })),
      explicitConfirmation: true,
      items,
      projectId: input.projectId,
      rosterFingerprint: rosterFingerprint(input.rosterUnits),
      selectedUnitIds,
      sourceLabel: 'Manual selection in personal Turn OS',
      tradeChoice: input.draft.tradeChoice,
    },
  };
}

export function validatePreparedReleaseAgainstRoster(
  plan: PreparedDailyReleasePlan,
  rosterUnits: readonly ProjectRosterUnitOption[],
): readonly string[] {
  if (plan.rosterFingerprint !== rosterFingerprint(rosterUnits)) {
    return [
      'The Property roster changed after review. Review today’s release again before saving.',
    ];
  }
  return [];
}

export function createConfirmedDailyReleaseBatch(
  plan: PreparedDailyReleasePlan,
  rosterUnits: readonly ProjectRosterUnitOption[],
  context: DailyReleaseBatchContext,
): DailyReleaseBatch {
  const staleErrors = validatePreparedReleaseAgainstRoster(plan, rosterUnits);
  if (staleErrors.length > 0) throw new Error(staleErrors[0]);
  if (!context.batchId || !context.confirmedAt || !context.confirmedBy) {
    throw new Error('Release confirmation requires a durable ID, time, and actor.');
  }
  const items: DailyReleaseItem[] = plan.items.map((item, index) => ({
    id: `${context.batchId}:item:${index + 1}`,
    restriction: item.restriction,
    section: item.section,
    sourceExcerpt:
      `Manual personal selection: Unit ${item.unitNumber}, ${item.section}, ${item.trade}.`,
    trade: item.trade,
    unitId: item.unitId,
  }));
  return {
    confirmedAt: context.confirmedAt,
    confirmedBy: context.confirmedBy,
    createdAt: context.confirmedAt,
    date: plan.date,
    id: context.batchId,
    items,
    projectId: plan.projectId,
    propertyContact: plan.contactName,
    sourceLabel: plan.sourceLabel,
    sourceType: 'manual',
    status: 'confirmed',
    uncertainties: plan.exceptions.map((exception) =>
      `${exception.unitId} ${exception.section}: ${DAILY_RELEASE_EXCEPTION_LABELS[exception.kind]}`),
    updatedAt: context.confirmedAt,
  };
}

export function prepareFastStartDaySubmission(
  input: PrepareFastStartDayInput,
): FastStartDayPreparationResult {
  const release = prepareDailyReleasePlan({
    contacts: input.contacts,
    date: input.date,
    draft: input.releaseDraft,
    enabledTrades: input.enabledTrades,
    projectId: input.projectId,
    propertyContactId: input.propertyContactId,
    rosterUnits: input.rosterUnits,
  });
  const errors = release.ok ? [] : [...release.errors];
  if (!input.keyStatus) errors.push('Record today’s key status.');
  if (
    !isValidTimeValue(input.schedule.workStartTime)
    || !isValidTimeValue(input.schedule.workEndTime)
  ) {
    errors.push('Working start and end times are required.');
  }
  if (
    input.schedule.walkthroughTime
    && !isValidTimeValue(input.schedule.walkthroughTime)
  ) {
    errors.push('The walkthrough time is invalid.');
  }
  if (!input.explicitStartConfirmation) {
    errors.push('Review and explicitly confirm Start Day.');
  }
  const activeCrewById = new Map(
    input.crewOptions
      .filter((crew) => crew.active !== false)
      .map((crew) => [crew.id, crew] as const),
  );
  for (const trade of ['paint', 'clean'] as const) {
    if (
      !input.enabledTrades[trade]
      && input.activeCrewIdsByTrade[trade].length > 0
    ) {
      errors.push(
        `${crewTradeName(trade)} crews cannot be active when that trade is disabled.`,
      );
    }
    for (const crewId of unique(input.activeCrewIdsByTrade[trade])) {
      const crew = activeCrewById.get(crewId);
      if (!crew || crew.trade !== trade) {
        errors.push(
          `${crewTradeName(trade)} crew ${crewId} is unavailable or belongs to another trade.`,
        );
      }
    }
  }
  const selectedTrades = release.ok
    ? new Set(release.plan.items.map((item) => item.trade))
    : new Set<FieldTrade>();
  if (
    selectedTrades.has('paint')
    && unique(input.activeCrewIdsByTrade.paint).length === 0
  ) {
    errors.push('Select an active Paint crew for released Paint work.');
  }
  if (
    selectedTrades.has('clean')
    && unique(input.activeCrewIdsByTrade.clean).length === 0
  ) {
    errors.push('Select an active Clean crew for released Clean work.');
  }
  if (errors.length > 0 || !release.ok || !input.keyStatus) {
    return { errors, ok: false };
  }
  const contact = input.contacts.find((candidate) =>
    candidate.id === input.propertyContactId
    && candidate.projectId === input.projectId
    && candidate.activeForProject !== false);
  if (!contact) {
    return {
      errors: ['The selected Property Contact is no longer active.'],
      ok: false,
    };
  }
  return {
    ok: true,
    submission: {
      activeCrewIdsByTrade: {
        clean: unique(input.activeCrewIdsByTrade.clean),
        paint: unique(input.activeCrewIdsByTrade.paint),
      },
      date: input.date,
      explicitStartConfirmation: true,
      keyStatus: input.keyStatus,
      morningNote: input.morningNote?.trim() ?? '',
      projectId: input.projectId,
      propertyContact: { id: contact.id, name: contact.name },
      propertyName: input.propertyName,
      release: release.plan,
      schedule: { ...input.schedule },
    },
  };
}

const crewTradeName = (trade: FieldTrade) =>
  trade === 'paint' ? 'Paint' : 'Clean';

export function defaultActiveCrewIds(
  configuration: ProjectConfiguration,
  crews: readonly TrackACrewOption[],
) {
  const activeCrewIds = new Set(
    crews.filter((crew) => crew.active !== false).map((crew) => crew.id),
  );
  return {
    clean: configuration.enabledTrades.clean
      ? configuration.defaultCrewIdsByTrade.clean.filter((crewId) =>
        activeCrewIds.has(crewId))
      : [],
    paint: configuration.enabledTrades.paint
      ? configuration.defaultCrewIdsByTrade.paint.filter((crewId) =>
        activeCrewIds.has(crewId))
      : [],
  };
}
