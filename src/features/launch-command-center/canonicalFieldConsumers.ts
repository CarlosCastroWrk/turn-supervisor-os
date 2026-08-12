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

const tradeLabel = (trade: CanonicalWorkRecord['trade']) =>
  trade === 'paint' ? 'Paint' : 'Clean';

// Notifications read at Unit + Trade grain like every other list Los uses:
// one item per unit and trade per category, with the affected sections and
// any waiting reasons folded into the reason line.
interface UnitTradeGroup {
  head: CanonicalWorkRecord;
  key: string;
  sections: string[];
  waitingReasons: Set<string>;
}

const groupByUnitTrade = (
  records: readonly CanonicalWorkRecord[],
): UnitTradeGroup[] => {
  const groups = new Map<string, UnitTradeGroup>();
  for (const record of records) {
    const key = `${record.target.unitId}:${record.trade}`;
    const group = groups.get(key) ?? {
      head: record,
      key,
      sections: [],
      waitingReasons: new Set<string>(),
    };
    group.sections.push(sectionLabel(record.target.section));
    for (const reason of record.waitingReasons) group.waitingReasons.add(reason);
    groups.set(key, group);
  }
  return [...groups.values()];
};

const groupReason = (group: UnitTradeGroup) => [
  group.sections.join(', '),
  ...(group.waitingReasons.size > 0 ? [[...group.waitingReasons].join(' · ')] : []),
].join(' · ');

// Ready-to-walk is the highest-volume category — on a 166-unit Turn it can be
// dozens at once. Above a small threshold, collapse it into ONE summary that
// links to the walk queue, so the notifications list stays a short list of
// things that need Los, not a wall. Small counts still deep-link per unit+trade.
const READY_TO_WALK_SUMMARY_THRESHOLD = 3;

const readyToWalkNotifications = (
  groups: UnitTradeGroup[],
  readNotificationIds: ReadonlySet<string>,
): NativeNotificationItem[] => {
  if (groups.length <= READY_TO_WALK_SUMMARY_THRESHOLD) {
    return groups.map((group) => ({
      category: 'inspections' as const,
      destinationId: `unit:${group.head.target.unitId}:${group.head.target.trade}`,
      destinationLabel: `Unit ${group.head.unitNumber}`,
      group: 'today' as const,
      id: `canonical-walk:${group.key}`,
      read: readNotificationIds.has(`canonical-walk:${group.key}`),
      reason: groupReason(group),
      timeLabel: 'Current',
      title: `Unit ${group.head.unitNumber} · ${tradeLabel(group.head.trade)}`,
    }));
  }
  // Id carries the count so the summary re-surfaces (unread) as more become ready.
  const id = `canonical-walk-summary:${groups.length}`;
  const preview = groups.slice(0, 3).map((group) => `Unit ${group.head.unitNumber}`).join(', ');
  return [{
    category: 'inspections' as const,
    destinationId: 'walk',
    destinationLabel: 'Ready to walk',
    group: 'today' as const,
    id,
    read: readNotificationIds.has(id),
    reason: `${preview} and ${groups.length - 3} more are ready for your walk.`,
    timeLabel: 'Current',
    title: `${groups.length} ready to walk`,
  }];
};

export interface CanonicalUnitNote {
  readonly createdAt: string;
  readonly text: string;
  readonly unitId: string;
}

export interface CanonicalFieldConsumers {
  readonly homeRecords: readonly NativeHomeRecord[];
  readonly notifications: readonly NativeNotificationItem[];
  readonly searchGroups: readonly NativeSearchGroup[];
}

export const projectCanonicalFieldConsumers = (
  projection: CanonicalFieldProjection,
  readNotificationIds: ReadonlySet<string>,
  unitNotes: readonly CanonicalUnitNote[] = [],
): CanonicalFieldConsumers => {
  // Los reads queues at Unit + Trade grain: one record per unit and trade
  // per queue, with the crew on it, the affected sections, and the unit's
  // latest note — so a queue page answers "who's on it / what's flagged"
  // without opening every unit.
  const latestNoteByUnit = new Map<string, { count: number; text: string }>();
  for (const note of [...unitNotes].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt))) {
    if (!note.text.trim()) continue;
    const existing = latestNoteByUnit.get(note.unitId);
    if (existing) existing.count += 1;
    else latestNoteByUnit.set(note.unitId, { count: 1, text: note.text.trim() });
  }
  const homeGroups = new Map<string, {
    crewNames: Set<string>;
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
      crewNames: new Set<string>(),
      queue: record.queue,
      sections: [],
      trade: record.trade,
      unitId: record.target.unitId,
      unitNumber: record.unitNumber,
      waitingReasons: new Set<string>(),
    };
    if (record.crewName) group.crewNames.add(record.crewName);
    group.sections.push(sectionLabel(record.target.section));
    for (const reason of record.waitingReasons) group.waitingReasons.add(reason);
    homeGroups.set(key, group);
  }
  const homeRecords: NativeHomeRecord[] = [...homeGroups.entries()]
    .map(([key, group]) => {
      const note = latestNoteByUnit.get(group.unitId);
      return {
        destinationId: `unit:${group.unitId}:${group.trade}`,
        id: `canonical-home:${key}`,
        // The queue pages split Paint | Clean columns off the leading word of
        // this meta line — the trade must stay first.
        meta: [
          group.trade === 'paint' ? 'Paint' : 'Clean',
          ...(group.crewNames.size > 0 ? [[...group.crewNames].join(' + ')] : []),
          group.sections.join(', '),
          ...(group.waitingReasons.size > 0 ? [[...group.waitingReasons].join(' · ')] : []),
        ].join(' · '),
        ...(note
          ? {
            noteLine: `📝 ${note.text}${note.count > 1 ? ` (+${note.count - 1} more)` : ''}`,
          }
          : {}),
        summaryStates: [group.queue],
        unitLabel: `Unit ${group.unitNumber} · ${group.trade === 'paint' ? 'Paint' : 'Clean'}`,
      };
    });

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
    ...groupByUnitTrade(projection.assignmentConflicts).map((group) => ({
      category: 'conflicts' as const,
      destinationId: `unit:${group.head.target.unitId}:${group.head.target.trade}`,
      destinationLabel: `Unit ${group.head.unitNumber}`,
      group: 'important' as const,
      id: `canonical-conflict:${group.key}`,
      read: readNotificationIds.has(`canonical-conflict:${group.key}`),
      reason: groupReason(group) || 'Assignment responsibility conflicts.',
      timeLabel: 'Current',
      title: `Unit ${group.head.unitNumber} · ${tradeLabel(group.head.trade)}`,
    })),
    ...groupByUnitTrade(projection.queues.callbacks).map((group) => ({
      category: 'callbacks' as const,
      destinationId: `unit:${group.head.target.unitId}:${group.head.target.trade}`,
      destinationLabel: `Unit ${group.head.unitNumber}`,
      group: 'important' as const,
      id: `canonical-callback:${group.key}`,
      read: readNotificationIds.has(`canonical-callback:${group.key}`),
      reason: groupReason(group),
      timeLabel: 'Current',
      title: `Unit ${group.head.unitNumber} · ${tradeLabel(group.head.trade)}`,
    })),
    ...readyToWalkNotifications(groupByUnitTrade(projection.queues['ready-to-walk']), readNotificationIds),
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
