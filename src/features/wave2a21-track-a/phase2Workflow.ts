import type {
  DailyReleaseBatch,
  DailyReleaseItem,
  DaySessionKeyStatus,
  FieldSection,
  FieldTrade,
  ReleaseWorkType,
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

export const DAILY_RELEASE_TRADE_CHOICES = ['Both', 'Paint', 'Clean'] as const;
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

// A dictated room-level release: exactly which room of which unit, which trade,
// and the paint task. When a unit has roomPlan entries, ONLY those rooms release
// (with their work type) instead of the whole-unit expansion — this is how Los
// dictates "1104 A B touch-cut" and gets just A and B, touch-up+cut-in.
export interface RoomPlanEntry {
  readonly unitId: string;
  readonly section: FieldSection;
  readonly trade: FieldTrade;
  readonly workType?: ReleaseWorkType;
}

export interface DailyReleaseDraft {
  readonly exceptions: readonly DailyReleaseException[];
  readonly explicitConfirmation: boolean;
  readonly selectedUnitIds: readonly string[];
  readonly tradeChoice: DailyReleaseTradeChoice;
  readonly roomPlan?: readonly RoomPlanEntry[];
}

export type ExactUnitSelectionResult =
  | {
      readonly ok: true;
      readonly unitIds: readonly string[];
      readonly unitNumbers: readonly string[];
    }
  | {
      readonly ok: false;
      readonly errors: readonly string[];
    };

export interface PreparedDailyReleaseItem {
  readonly exception?: DailyReleaseExceptionKind;
  readonly restriction?: string;
  readonly section: FieldSection;
  readonly trade: FieldTrade;
  readonly unitId: string;
  readonly unitNumber: string;
  readonly workType?: ReleaseWorkType;
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

export interface FastStartDayDraft {
  readonly activeCrewIdsByTrade: {
    readonly clean: readonly string[];
    readonly paint: readonly string[];
  };
  readonly changeCrewsToday: boolean;
  readonly changeScheduleToday: boolean;
  readonly date: string;
  readonly explicitStartConfirmation: boolean;
  readonly keyStatus?: DaySessionKeyStatus;
  readonly morningNote: string;
  readonly propertyContactId: string;
  readonly releaseDraft: DailyReleaseDraft;
  readonly schedule: ProjectDefaultSchedule;
  readonly version: 1;
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
const SCHEDULE_TIME_PATTERN =
  /\b(?:(?:[01]\d|2[0-3]):[0-5]\d|(?:1[0-2]|0?[1-9])(?::[0-5]\d)?\s*(?:a\.?m\.?|p\.?m\.?))\b/giu;
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

const normalizeScheduleTime = (value: string): string | undefined => {
  const trimmed = value.trim();
  if (isValidTimeValue(trimmed)) return trimmed;
  const normalized = trimmed.toUpperCase().replaceAll('.', '').replace(/\s+/gu, '');
  const match = normalized.match(/^(1[0-2]|0?[1-9])(?::([0-5]\d))?(AM|PM)$/u);
  if (!match) return undefined;
  const sourceHour = Number(match[1]);
  const hour = match[3] === 'AM'
    ? sourceHour % 12
    : (sourceHour % 12) + 12;
  return `${String(hour).padStart(2, '0')}:${match[2] ?? '00'}`;
};

const scheduleTimesFromWording = (wording: string) => (
  [...wording.matchAll(SCHEDULE_TIME_PATTERN)]
    .map((match) => normalizeScheduleTime(match[0]))
    .filter((value): value is string => Boolean(value))
);

export function configurationWithSchedule(
  configuration: ProjectConfiguration,
  schedule: ProjectDefaultSchedule,
): ProjectConfiguration {
  const hasStartTime = isValidTimeValue(schedule.workStartTime);
  const hasEndTime = isValidTimeValue(schedule.workEndTime);
  const workingHoursWording = hasStartTime && hasEndTime
    ? formatWorkingHoursWording(schedule.workStartTime, schedule.workEndTime)
    : hasStartTime || hasEndTime
      ? `${hasStartTime ? schedule.workStartTime : ''}–${hasEndTime ? schedule.workEndTime : ''}`
      : '';
  return {
    ...configuration,
    defaultWalkthroughScheduleWording:
      formatWalkthroughScheduleWording(schedule.walkthroughTime),
    defaultWorkingHoursWording: workingHoursWording,
  };
}

export function resolveProjectDefaultSchedule(
  configuration: ProjectConfiguration,
): ProjectDefaultSchedule {
  const partialWorkingTimes = configuration.defaultWorkingHoursWording
    .trim()
    .match(/^((?:[01]\d|2[0-3]):[0-5]\d)?–((?:[01]\d|2[0-3]):[0-5]\d)?$/u);
  const workingTimes = scheduleTimesFromWording(
    configuration.defaultWorkingHoursWording,
  );
  const walkthroughTime = scheduleTimesFromWording(
    configuration.defaultWalkthroughScheduleWording,
  )[0];
  return {
    workEndTime: partialWorkingTimes?.[2] ?? workingTimes[1] ?? '',
    workStartTime: partialWorkingTimes?.[1] ?? workingTimes[0] ?? '',
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

export function resolveExactUnitNumberSelection(
  source: string,
  rosterUnits: readonly ProjectRosterUnitOption[],
): ExactUnitSelectionResult {
  const unitNumbers = source
    .split(/[\s,]+/u)
    .map((value) => value.trim())
    .filter(Boolean);
  if (unitNumbers.length === 0) {
    return {
      errors: ['Enter one or more exact Unit numbers separated by commas, spaces, or new lines.'],
      ok: false,
    };
  }

  const duplicateInput = unique(
    unitNumbers.filter((unitNumber, index) =>
      unitNumbers.indexOf(unitNumber) !== index),
  );
  const rosterByUnitNumber = new Map<string, ProjectRosterUnitOption[]>();
  for (const unit of rosterUnits) {
    const matches = rosterByUnitNumber.get(unit.unitNumber) ?? [];
    matches.push(unit);
    rosterByUnitNumber.set(unit.unitNumber, matches);
  }
  const unmatched = unique(unitNumbers.filter((unitNumber) =>
    !rosterByUnitNumber.has(unitNumber)),
  );
  const ambiguous = unique(unitNumbers.filter((unitNumber) =>
    (rosterByUnitNumber.get(unitNumber)?.length ?? 0) > 1),
  );
  const errors: string[] = [];
  if (duplicateInput.length > 0) {
    errors.push(`Duplicate Unit numbers: ${duplicateInput.join(', ')}.`);
  }
  if (unmatched.length > 0) {
    errors.push(`Not in the current Property roster: ${unmatched.join(', ')}.`);
  }
  if (ambiguous.length > 0) {
    errors.push(`Unit numbers are not unique in the current Property roster: ${ambiguous.join(', ')}.`);
  }
  if (errors.length > 0) return { errors, ok: false };

  const exactUnitNumbers = unique(unitNumbers);
  return {
    ok: true,
    unitIds: exactUnitNumbers.map((unitNumber) =>
      rosterByUnitNumber.get(unitNumber)![0].id),
    unitNumbers: exactUnitNumbers,
  };
}

export function createFastStartDayDraft(input: {
  readonly configuration: ProjectConfiguration;
  readonly contacts: readonly PropertyContact[];
  readonly crewOptions: readonly TrackACrewOption[];
  readonly currentDate: string;
  readonly projectId: string;
}): FastStartDayDraft {
  const availableContacts = input.contacts.filter((contact) =>
    contact.projectId === input.projectId && contact.activeForProject !== false);
  const availableTradeChoices = availableDailyReleaseTradeChoices(
    input.configuration.enabledTrades,
  );
  return {
    activeCrewIdsByTrade: defaultActiveCrewIds(
      input.configuration,
      input.crewOptions,
    ),
    changeCrewsToday: false,
    changeScheduleToday: false,
    date: input.currentDate,
    explicitStartConfirmation: false,
    keyStatus: undefined,
    morningNote: '',
    propertyContactId: availableContacts.some((contact) =>
      contact.id === input.configuration.defaultPropertyContactId)
      ? input.configuration.defaultPropertyContactId
      : availableContacts[0]?.id ?? '',
    releaseDraft: createDailyReleaseDraft(
      availableTradeChoices[0] ?? 'Paint',
    ),
    schedule: resolveProjectDefaultSchedule(input.configuration),
    version: 1,
  };
}

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
  // Group dictated room-level entries by unit — these override the whole-unit
  // expansion so only the rooms Los actually said get released, with their task.
  const roomPlanByUnit = new Map<string, RoomPlanEntry[]>();
  for (const entry of input.draft.roomPlan ?? []) {
    const unit = rosterById.get(entry.unitId);
    if (!unit || !unit.applicableSections.includes(entry.section)) continue;
    const list = roomPlanByUnit.get(entry.unitId) ?? [];
    list.push(entry);
    roomPlanByUnit.set(entry.unitId, list);
  }
  const items = selectedUnitIds.flatMap((unitId) => {
    const unit = rosterById.get(unitId);
    if (!unit) return [];
    const planned = roomPlanByUnit.get(unitId);
    if (planned && planned.length > 0) {
      // Room-level: exactly the dictated rooms + trade + task. De-duped by
      // unit:section:trade so a repeat never double-releases.
      const seen = new Set<string>();
      return planned.flatMap((entry): PreparedDailyReleaseItem[] => {
        const key = `${entry.section}:${entry.trade}`;
        if (seen.has(key)) return [];
        seen.add(key);
        const exception = exceptionByTarget.get(`${unit.id}:${entry.section}`);
        if (blocksRelease(exception)) return [];
        return [{
          exception,
          restriction: exceptionRestriction(exception),
          section: entry.section,
          trade: entry.trade,
          unitId: unit.id,
          unitNumber: unit.unitNumber,
          workType: entry.workType,
        }];
      });
    }
    // Whole-unit (grid tap): every applicable section, per the trade choice.
    return unit.applicableSections.flatMap((section) => {
      const exception = exceptionByTarget.get(`${unit.id}:${section}`);
      if (blocksRelease(exception)) return [];
      return trades.map((trade): PreparedDailyReleaseItem => ({
        exception,
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
    sourceExcerpt: [
      `Manual personal selection: Unit ${item.unitNumber}, ${item.section}, ${item.trade}.`,
      item.exception
        ? `Target exception: ${DAILY_RELEASE_EXCEPTION_LABELS[item.exception]}.`
        : '',
    ].filter(Boolean).join(' '),
    trade: item.trade,
    unitId: item.unitId,
    // The dictated paint task rides through to the confirmed batch so it's
    // recorded at release — not defaulted to full and re-entered later.
    ...(item.workType ? { workType: item.workType } : {}),
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
    uncertainties: [],
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
