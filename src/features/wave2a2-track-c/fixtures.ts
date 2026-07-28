import {
  DEFAULT_TRACK_C_TERMINOLOGY,
  TRACK_C_SECTIONS,
  TRACK_C_TRADES,
  type TrackCAccessState,
  type TrackCConfirmedEvent,
  type TrackCReleaseState,
  type TrackCSection,
  type TrackCSourceConfidence,
  type TrackCState,
  type TrackCTrade,
  type TrackCUnit,
  type TrackCWorkFact,
  type TrackCWorkTarget,
} from './model';

interface FactOverride {
  readonly release?: TrackCReleaseState;
  readonly access?: TrackCAccessState;
  readonly sourceConfidence?: TrackCSourceConfidence;
  readonly sourceLabel?: string;
  readonly restrictionLabel?: string;
}

type FactOverrides = Readonly<Record<string, FactOverride>>;

const bedroomSections = (bedrooms: number): readonly TrackCSection[] => [
  'common',
  ...TRACK_C_SECTIONS.slice(1, bedrooms + 1),
];

const factOverrideKey = (trade: TrackCTrade, section: TrackCSection) =>
  `${trade}:${section}`;

const createUnit = (
  unitNumber: string,
  bedrooms: number,
  locationLabel: string,
  overrides: FactOverrides = {},
): TrackCUnit => {
  const id = `unit-${unitNumber}`;
  const applicableSections = bedroomSections(bedrooms);
  const workFacts = TRACK_C_TRADES.flatMap((trade) =>
    applicableSections.map((section): TrackCWorkFact => {
      const override = overrides[factOverrideKey(trade, section)] ?? {};
      return {
        id: `${id}:${trade}:${section}`,
        unitId: id,
        trade,
        section,
        release: override.release ?? 'released',
        access: override.access ?? 'clear',
        sourceConfidence: override.sourceConfidence ?? 'confirmed',
        sourceLabel:
          override.sourceLabel ?? 'Synthetic confirmed release reference',
        restrictionLabel: override.restrictionLabel,
      };
    }),
  );
  return {
    id,
    unitNumber,
    unitType: `${bedrooms}BR`,
    locationLabel,
    applicableSections,
    workFacts,
  };
};
let eventSequence = 0;

const resetEventSequence = () => {
  eventSequence = 0;
};

const nextRecordedAt = () => {
  const date = new Date('2026-07-28T13:00:00.000Z');
  date.setMinutes(date.getMinutes() + eventSequence * 3);
  eventSequence += 1;
  return date.toISOString();
};

const fixtureEvent = (
  target: TrackCWorkTarget,
  eventType: TrackCConfirmedEvent['eventType'],
  crewId: string | undefined,
  summary: string,
  confirmation: TrackCConfirmedEvent['confirmation'] = 'confirmed',
): TrackCConfirmedEvent => ({
  id: `track-c-event-${eventSequence + 1}`,
  eventType,
  confirmation,
  target,
  crewId,
  recordedAt: nextRecordedAt(),
  recordedBy: 'Synthetic Los',
  sourceType:
    eventType === 'crew-reported-complete'
      ? 'crew-report'
      : eventType.startsWith('property-') ||
          eventType === 'walk-not-walked' ||
          eventType === 'walk-deferred'
        ? 'property-walk-observation'
        : 'synthetic-fixture',
  sourceLabel: 'Synthetic Track C acceptance fixture',
  summary,
  personalRecordOnly: true,
  officialPaperChanged: false,
  payrollChanged: false,
});

type FixtureStage =
  | 'assigned'
  | 'working'
  | 'crew-complete'
  | 'los-passed'
  | 'callback-open'
  | 'reinspection-pending'
  | 'callback-resolved'
  | 'accepted'
  | 'mirrored';

const stageEvents = (
  target: TrackCWorkTarget,
  crewId: string,
  stage: FixtureStage,
): readonly TrackCConfirmedEvent[] => {
  const events: TrackCConfirmedEvent[] = [
    fixtureEvent(
      target,
      'assignment-confirmed',
      crewId,
      'Confirmed personal crew assignment fixture.',
    ),
  ];
  if (stage === 'assigned') return events;
  events.push(
    fixtureEvent(target, 'work-started', crewId, 'Work started fixture.'),
  );
  if (stage === 'working') return events;
  events.push(
    fixtureEvent(
      target,
      'crew-reported-complete',
      crewId,
      'Crew-reported completion fixture. Los inspection remains separate.',
    ),
  );
  if (stage === 'crew-complete') return events;
  if (stage === 'callback-open' || stage === 'reinspection-pending') {
    events.push(
      fixtureEvent(
        target,
        'callback-opened',
        crewId,
        'Callback opened for synthetic acceptance testing.',
      ),
    );
    if (stage === 'reinspection-pending') {
      events.push(
        fixtureEvent(
          target,
          'callback-correction-reported',
          crewId,
          'Correction reported ready; reinspection remains pending.',
        ),
      );
    }
    return events;
  }
  events.push(
    fixtureEvent(
      target,
      'los-passed',
      crewId,
      'Los inspection passed fixture. Property acceptance remains separate.',
    ),
  );
  if (stage === 'los-passed') return events;
  if (stage === 'callback-resolved') {
    events.push(
      fixtureEvent(
        target,
        'callback-opened',
        crewId,
        'Callback opened after Los observation.',
      ),
      fixtureEvent(
        target,
        'callback-correction-reported',
        crewId,
        'Correction reported ready.',
      ),
      fixtureEvent(
        target,
        'callback-resolved',
        crewId,
        'Los passed the callback reinspection.',
      ),
    );
    return events;
  }
  events.push(
    fixtureEvent(
      target,
      'property-accepted',
      crewId,
      'Property acceptance recorded personally in synthetic fixture.',
    ),
  );
  if (stage === 'accepted') return events;
  events.push(
    fixtureEvent(
      target,
      'personal-pds-mirror-recorded',
      crewId,
      'Personal PDS Approved paper mirror fixture.',
    ),
  );
  return events;
};

const target = (
  unitNumber: string,
  trade: TrackCTrade,
  section: TrackCSection,
): TrackCWorkTarget => ({
  unitId: `unit-${unitNumber}`,
  trade,
  section,
});

export const createSyntheticTrackCState = (): TrackCState => {
  resetEventSequence();
  const units = [
    createUnit('301', 3, 'Building 3 · Floor 3'),
    createUnit('304', 4, 'Building 3 · Floor 3', {
      'clean:common': { release: 'unreleased' },
      'clean:A': { release: 'unreleased' },
      'clean:B': { release: 'unreleased' },
      'clean:C': { release: 'unreleased' },
      'clean:D': { release: 'unreleased' },
    }),
    createUnit('401', 3, 'Building 4 · Floor 4', {
      'paint:A': {
        release: 'assignment-conflict',
        sourceConfidence: 'conflicting',
        sourceLabel: 'Synthetic conflicting assignment references',
      },
      'clean:B': {
        access: 'access-blocked',
        restrictionLabel: 'Key/access issue — do not enter.',
      },
      'clean:C': {
        access: 'occupied-restricted',
        restrictionLabel: 'Occupied/renewal room — do not enter.',
      },
    }),
    createUnit('410', 3, 'Building 4 · Floor 4'),
    createUnit('501', 4, 'Building 5 · Floor 5', {
      'paint:common': {
        release: 'source-uncertain',
        sourceConfidence: 'uncertain',
        sourceLabel: 'Synthetic release source needs confirmation',
      },
      'paint:C': {
        access: 'occupied-restricted',
        restrictionLabel: 'Occupied/renewal room — do not enter.',
      },
      'clean:common': {
        release: 'assignment-conflict',
        sourceConfidence: 'conflicting',
        sourceLabel: 'Synthetic source conflict',
      },
    }),
    createUnit('606', 5, 'Building 6 · Floor 6'),
    createUnit('707', 2, 'Building 7 · Floor 7'),
    createUnit('1505', 5, 'Building 15 · Floor 15'),
  ];

  const crews = [
    {
      id: 'crew-bluebird-paint',
      name: 'Bluebird Paint',
      trade: 'paint' as const,
      phone: '512-555-0101',
      activeToday: true,
    },
    {
      id: 'crew-atlas-paint',
      name: 'Atlas Paint',
      trade: 'paint' as const,
      phone: '512-555-0102',
      activeToday: true,
    },
    {
      id: 'crew-cedar-clean',
      name: 'Cedar Clean',
      trade: 'clean' as const,
      phone: '512-555-0103',
      activeToday: true,
    },
    {
      id: 'crew-bright-clean',
      name: 'Bright Clean',
      trade: 'clean' as const,
      phone: '512-555-0104',
      activeToday: true,
    },
  ];

  const events: TrackCConfirmedEvent[] = [
    ...stageEvents(target('301', 'paint', 'common'), 'crew-bluebird-paint', 'los-passed'),
    ...stageEvents(target('301', 'paint', 'A'), 'crew-bluebird-paint', 'los-passed'),
    ...stageEvents(target('301', 'paint', 'B'), 'crew-bluebird-paint', 'crew-complete'),
    ...stageEvents(target('301', 'paint', 'C'), 'crew-bluebird-paint', 'working'),
    ...stageEvents(target('301', 'clean', 'common'), 'crew-cedar-clean', 'crew-complete'),
    ...stageEvents(target('301', 'clean', 'A'), 'crew-cedar-clean', 'working'),
    ...stageEvents(target('301', 'clean', 'B'), 'crew-cedar-clean', 'assigned'),
    ...stageEvents(target('304', 'paint', 'common'), 'crew-atlas-paint', 'working'),
    ...stageEvents(target('304', 'paint', 'A'), 'crew-atlas-paint', 'working'),
    ...stageEvents(target('401', 'paint', 'A'), 'crew-bluebird-paint', 'assigned'),
    fixtureEvent(
      target('401', 'paint', 'A'),
      'assignment-confirmed',
      'crew-atlas-paint',
      'Second active assignment fixture creates a conflict.',
    ),
    ...stageEvents(target('401', 'clean', 'B'), 'crew-cedar-clean', 'assigned'),
    ...stageEvents(target('410', 'paint', 'common'), 'crew-bluebird-paint', 'mirrored'),
    ...stageEvents(target('410', 'paint', 'A'), 'crew-bluebird-paint', 'accepted'),
    ...stageEvents(target('410', 'clean', 'A'), 'crew-bright-clean', 'callback-open'),
    ...stageEvents(target('606', 'paint', 'common'), 'crew-atlas-paint', 'mirrored'),
    ...stageEvents(target('606', 'paint', 'A'), 'crew-atlas-paint', 'accepted'),
    ...stageEvents(target('606', 'paint', 'B'), 'crew-atlas-paint', 'crew-complete'),
    ...stageEvents(target('606', 'paint', 'C'), 'crew-atlas-paint', 'working'),
    ...stageEvents(target('606', 'paint', 'D'), 'crew-atlas-paint', 'working'),
    ...stageEvents(target('606', 'clean', 'common'), 'crew-bright-clean', 'los-passed'),
    ...stageEvents(target('606', 'clean', 'A'), 'crew-bright-clean', 'los-passed'),
    ...stageEvents(target('606', 'clean', 'B'), 'crew-bright-clean', 'working'),
    ...stageEvents(target('1505', 'paint', 'A'), 'crew-bluebird-paint', 'reinspection-pending'),
    ...stageEvents(target('1505', 'clean', 'A'), 'crew-cedar-clean', 'los-passed'),
    fixtureEvent(
      target('707', 'paint', 'A'),
      'assignment-confirmed',
      'crew-bluebird-paint',
      'Draft assignment must not affect projections or crew stats.',
      'draft',
    ),
  ];

  return {
    propertyId: 'synthetic-inspire',
    propertyName: 'Inspire-style synthetic field board',
    units,
    crews,
    events,
    completedWalks: [],
    terminology: DEFAULT_TRACK_C_TERMINOLOGY,
  };
};

export const createTrackCScaleState = (unitCount = 500): TrackCState => {
  resetEventSequence();
  const crews = createSyntheticTrackCState().crews;
  const units = Array.from({ length: unitCount }, (_, index) => {
    const unitNumber = String(1001 + index);
    const bedrooms = 2 + (index % 4);
    const building = 1 + Math.floor(index / 50);
    return createUnit(
      unitNumber,
      bedrooms,
      `Building ${building} · Floor ${1 + (index % 12)}`,
      index % 17 === 0
        ? {
            'paint:common': {
              access: 'occupied-restricted',
              restrictionLabel: 'Synthetic occupied restriction.',
            },
          }
        : {},
    );
  });
  return {
    propertyId: 'synthetic-scale',
    propertyName: `${unitCount}-Unit synthetic scale fixture`,
    units,
    crews,
    events: [],
    completedWalks: [],
    terminology: DEFAULT_TRACK_C_TERMINOLOGY,
  };
};
