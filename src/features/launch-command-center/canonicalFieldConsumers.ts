import type {
  NativeHomeRecord,
  NativeNotificationItem,
  NativeSearchGroup,
} from '../wave2a1-native/track-a';
import type {
  CanonicalFieldProjection,
  CanonicalWorkRecord,
} from '../wave2a21-track-a';

const sectionLabel = (section: CanonicalWorkRecord['target']['section']) =>
  section === 'common' ? 'Common' : `Room ${section}`;

const workMeta = (record: CanonicalWorkRecord) => [
  record.trade === 'paint' ? 'Paint' : 'Clean',
  sectionLabel(record.target.section),
  ...(record.waitingReasons.length > 0 ? [record.waitingReasons.join(' · ')] : []),
].join(' · ');

export interface CanonicalFieldConsumers {
  readonly homeRecords: readonly NativeHomeRecord[];
  readonly notifications: readonly NativeNotificationItem[];
  readonly searchGroups: readonly NativeSearchGroup[];
}

export const projectCanonicalFieldConsumers = (
  projection: CanonicalFieldProjection,
  readNotificationIds: ReadonlySet<string>,
): CanonicalFieldConsumers => {
  // Los reads queues at Unit + Trade grain: one record per unit and trade
  // per queue, with the affected sections listed in the meta line.
  const homeGroups = new Map<string, {
    queue: NonNullable<CanonicalWorkRecord['queue']>;
    sections: string[];
    trade: CanonicalWorkRecord['trade'];
    unitId: string;
    unitNumber: string;
    waitingReasons: Set<string>;
  }>();
  for (const record of projection.workRecords) {
    if (!record.queue) continue;
    const key = `${record.target.unitId}:${record.trade}:${record.queue}`;
    const group = homeGroups.get(key) ?? {
      queue: record.queue,
      sections: [],
      trade: record.trade,
      unitId: record.target.unitId,
      unitNumber: record.unitNumber,
      waitingReasons: new Set<string>(),
    };
    group.sections.push(sectionLabel(record.target.section));
    for (const reason of record.waitingReasons) group.waitingReasons.add(reason);
    homeGroups.set(key, group);
  }
  const homeRecords: NativeHomeRecord[] = [...homeGroups.entries()]
    .map(([key, group]) => ({
      destinationId: `unit:${group.unitId}`,
      id: `canonical-home:${key}`,
      meta: [
        group.trade === 'paint' ? 'Paint' : 'Clean',
        group.sections.join(', '),
        ...(group.waitingReasons.size > 0 ? [[...group.waitingReasons].join(' · ')] : []),
      ].join(' · '),
      summaryStates: [group.queue],
      unitLabel: `Unit ${group.unitNumber} · ${group.trade === 'paint' ? 'Paint' : 'Clean'}`,
    }));

  const unitSearchResults = [...new Map(
    projection.workRecords.map((record) => [
      record.target.unitId,
      {
        destinationId: `unit:${record.target.unitId}`,
        id: `canonical-unit:${record.target.unitId}`,
        keywords: [
          record.unitType,
          record.locationLabel,
          ...projection.workRecords
            .filter((candidate) => candidate.target.unitId === record.target.unitId)
            .flatMap((candidate) => [
              candidate.trade,
              candidate.target.section,
              ...candidate.waitingReasons,
            ]),
        ],
        meta: `${record.unitType} · ${record.locationLabel}`,
        title: `Unit ${record.unitNumber}`,
      },
    ]),
  ).values()];

  const crewSearchResults = projection.crewCurrentWork.map((crew) => ({
    destinationId: `crew:${crew.crewId}`,
    id: `canonical-crew:${crew.crewId}`,
    keywords: [crew.trade],
    meta: `${crew.trade === 'paint' ? 'Paint' : 'Clean'} · ${crew.currentAssignments} current`,
    title: crew.crewName,
  }));

  const activitySearchResults = projection.activity.map((activity) => ({
    destinationId: activity.unitId ? `unit:${activity.unitId}` : 'activity',
    id: `canonical-activity:${activity.id}`,
    keywords: [
      activity.wording,
      activity.trade ?? '',
      activity.section ?? '',
    ],
    meta: activity.wording,
    title: activity.title,
  }));

  const notifications: NativeNotificationItem[] = [
    ...projection.assignmentConflicts.map((record) => ({
      category: 'conflicts' as const,
      destinationId: `unit:${record.target.unitId}`,
      destinationLabel: `Unit ${record.unitNumber}`,
      group: 'important' as const,
      id: `canonical-conflict:${record.id}`,
      read: readNotificationIds.has(`canonical-conflict:${record.id}`),
      reason: record.waitingReasons.join(' · ') || 'Assignment responsibility conflicts.',
      timeLabel: 'Current',
      title: `Unit ${record.unitNumber}`,
    })),
    ...projection.queues.callbacks.map((record) => ({
      category: 'callbacks' as const,
      destinationId: `unit:${record.target.unitId}`,
      destinationLabel: `Unit ${record.unitNumber}`,
      group: 'important' as const,
      id: `canonical-callback:${record.id}`,
      read: readNotificationIds.has(`canonical-callback:${record.id}`),
      reason: workMeta(record),
      timeLabel: 'Current',
      title: `Unit ${record.unitNumber}`,
    })),
    ...projection.queues['ready-to-walk'].map((record) => ({
      category: 'inspections' as const,
      destinationId: `unit:${record.target.unitId}`,
      destinationLabel: `Unit ${record.unitNumber}`,
      group: 'today' as const,
      id: `canonical-walk:${record.id}`,
      read: readNotificationIds.has(`canonical-walk:${record.id}`),
      reason: workMeta(record),
      timeLabel: 'Current',
      title: `Unit ${record.unitNumber}`,
    })),
  ];

  return {
    homeRecords,
    notifications,
    searchGroups: [
      { id: 'units', results: unitSearchResults },
      { id: 'crews', results: crewSearchResults },
      { id: 'activity', results: activitySearchResults },
    ],
  };
};
