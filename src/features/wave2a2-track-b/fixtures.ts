import {
  createTodayTask,
  createTodayTaskGoal,
  type StartDayResult,
  startDaySession,
} from './model';
import type {
  DailyReleaseBatch,
  DaySession,
  DaySessionEvent,
  PropertyRoster,
  PropertyRosterUnit,
  TodayTask,
  TodayTaskSection,
  TrackBCrewOption,
} from './types';

export const SYNTHETIC_ACCOUNT_ID = 'synthetic-account';
export const SYNTHETIC_PROPERTY_ID = 'synthetic-property';
export const SYNTHETIC_DATE = '2026-08-03';

const sectionTemplates = {
  two: [
    { id: 'common', label: 'Common', trades: ['Paint', 'Clean'] as const },
    { id: 'a', label: 'A', trades: ['Paint', 'Clean'] as const },
  ],
  three: [
    { id: 'common', label: 'Common', trades: ['Paint', 'Clean'] as const },
    { id: 'a', label: 'A', trades: ['Paint', 'Clean'] as const },
    { id: 'b', label: 'B', trades: ['Paint', 'Clean'] as const },
  ],
} as const;

const createRosterUnit = (index: number): PropertyRosterUnit => {
  const floor = Math.floor(index / 25) + 1;
  const onFloor = (index % 25) + 1;
  const unitNumber = `${floor}${String(onFloor).padStart(2, '0')}`;
  const applicableSections = index < 32 ? sectionTemplates.three : sectionTemplates.two;
  return {
    applicableSections,
    building: floor <= 10 ? 'North' : 'South',
    floor: String(floor),
    id: `unit-${unitNumber}`,
    propertyId: SYNTHETIC_PROPERTY_ID,
    unitNumber,
    unitType: applicableSections.length === 3 ? '2 bedroom' : '1 bedroom',
  };
};

export function createSyntheticRoster(size = 500): PropertyRoster {
  return {
    propertyId: SYNTHETIC_PROPERTY_ID,
    propertyName: 'Synthetic Field Property',
    sourceReference: 'Feature-local synthetic roster fixture',
    units: Array.from({ length: size }, (_, index) => createRosterUnit(index)),
  };
}

export function createSyntheticRelease(
  roster = createSyntheticRoster(),
  releasedUnitCount = 40,
): DailyReleaseBatch {
  return {
    confirmedAt: '2026-08-03T12:10:00.000Z',
    confirmedBy: 'Los (synthetic preview)',
    confirmationStatus: 'confirmed',
    date: SYNTHETIC_DATE,
    entries: roster.units.slice(0, releasedUnitCount).flatMap((unit) => (
      unit.applicableSections.map((section) => ({
        restrictions: [],
        sectionId: section.id,
        trades: [...section.trades],
        uncertainties: [],
        unitId: unit.id,
      }))
    )),
    id: 'release-2026-08-03-synthetic',
    originalSourceReference: 'Synthetic reviewed release fixture',
    propertyContact: 'Synthetic property contact',
    propertyId: roster.propertyId,
  };
}

export const SYNTHETIC_CREWS: readonly TrackBCrewOption[] = [
  { activeToday: true, id: 'paint-blue', name: 'Blue Paint', trade: 'Paint' },
  { activeToday: true, id: 'paint-gold', name: 'Gold Paint', trade: 'Paint' },
  { activeToday: true, id: 'clean-green', name: 'Green Clean', trade: 'Clean' },
  { activeToday: false, id: 'clean-silver', name: 'Silver Clean', trade: 'Clean' },
];

const updateSyntheticSection = (
  section: TodayTaskSection,
  index: number,
): TodayTaskSection => {
  const assignedCrew = (trade: 'Paint' | 'Clean') => (
    trade === 'Paint' ? (index % 2 === 0 ? 'paint-blue' : 'paint-gold') : 'clean-green'
  );
  const tradeStates = section.tradeStates.map((state) => {
    if (index < 6) {
      return {
        ...state,
        assignedCrewId: assignedCrew(state.trade),
        execution: 'crew-reported-complete' as const,
        inspection: 'callback-required' as const,
        propertyWalk: 'not-ready' as const,
      };
    }
    if (index < 8) {
      return {
        ...state,
        assignedCrewId: assignedCrew(state.trade),
        execution: 'crew-reported-complete' as const,
        inspection: 'passed-after-callback' as const,
        propertyWalk: 'pending' as const,
      };
    }
    if (index < 40) {
      return {
        ...state,
        assignedCrewId: assignedCrew(state.trade),
        execution: 'crew-reported-complete' as const,
        inspection: 'passed' as const,
        propertyWalk: 'pending' as const,
      };
    }
    if (index < 48) {
      return {
        ...state,
        assignedCrewId: assignedCrew(state.trade),
        execution: 'crew-reported-complete' as const,
        inspection: 'passed' as const,
        propertyWalk: 'accepted' as const,
      };
    }
    if (index < 64) {
      return {
        ...state,
        assignedCrewId: assignedCrew(state.trade),
        execution: 'working' as const,
      };
    }
    if (index < 72) {
      return {
        ...state,
        assignedCrewId: assignedCrew(state.trade),
        execution: 'assigned' as const,
      };
    }
    return state;
  });

  return {
    ...section,
    tradeStates,
    waitingReasons: index >= 64 && index < 72 ? ['Access follow-up recorded'] : [],
  };
};

export function createSyntheticTodayTask(
  roster = createSyntheticRoster(),
  release = createSyntheticRelease(roster),
  daySessionId = 'day-session-synthetic',
): TodayTask {
  const base = createTodayTask(roster, [release], SYNTHETIC_DATE, daySessionId);
  if (!base) throw new Error('Synthetic confirmed release did not produce Today’s Task.');
  return {
    ...base,
    sections: base.sections.map(updateSyntheticSection),
  };
}

export function createSyntheticActiveSession(
  release = createSyntheticRelease(),
  roster = createSyntheticRoster(),
): StartDayResult {
  const selectedTask = createTodayTask(
    roster,
    [release],
    SYNTHETIC_DATE,
    'day-session-synthetic',
  );
  if (!selectedTask) throw new Error('Synthetic release did not produce a Start Day goal.');
  return startDaySession({
    accountId: SYNTHETIC_ACCOUNT_ID,
    activeCrewIdsByTrade: {
      Clean: ['clean-green'],
      Paint: ['paint-blue', 'paint-gold'],
    },
    assignmentEvidenceReviewNote: 'Reviewed the synthetic assignment evidence reference.',
    crewReviewConfirmed: { Clean: true, Paint: true },
    date: SYNTHETIC_DATE,
    daySessionId: 'day-session-synthetic',
    explicitConfirmation: true,
    goal: createTodayTaskGoal(selectedTask),
    keyStatus: 'yes',
    morningNote: 'Synthetic preview only.',
    propertyContact: release.propertyContact,
    propertyId: SYNTHETIC_PROPERTY_ID,
    releaseBatchIds: [release.id],
    startedBy: 'Los',
    walkthroughScheduleWording: 'Daily walkthrough at 12:00 PM with the synthetic contact.',
    workingHoursWording: 'Occupied areas: 10:00 AM–5:00 PM; vacant areas may continue later.',
  }, [release], roster, [], '2026-08-03T12:15:00.000Z');
}

export function createSyntheticEvents(
  session: DaySession,
): readonly DaySessionEvent[] {
  return [
    {
      actorId: 'Los',
      actorType: 'los',
      daySessionId: session.daySessionId,
      eventId: 'synthetic-note',
      eventType: 'note-saved',
      personalOfficialBoundary: 'personal-record-only',
      propertyId: session.propertyId,
      recordedAt: '2026-08-03T14:00:00.000Z',
      recordedBy: 'Los',
      sourceType: 'personal-entry',
      summary: 'Synthetic morning note.',
    },
    {
      actorId: 'Los',
      actorType: 'los',
      daySessionId: session.daySessionId,
      eventId: 'synthetic-photo',
      eventType: 'photo-saved',
      personalOfficialBoundary: 'personal-record-only',
      propertyId: session.propertyId,
      recordedAt: '2026-08-03T15:00:00.000Z',
      recordedBy: 'Los',
      sourceType: 'personal-entry',
      summary: 'Synthetic photo reference.',
    },
  ];
}
