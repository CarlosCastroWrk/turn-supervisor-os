import type { ActivityLog, FieldEvent } from '../../types';
import type {
  OperationalEventKind,
  OperationalSourceReference,
} from '../operational-memory/contracts';
import type { TrackAFieldActivity } from './contracts';

const eventKindFor = (event: FieldEvent): OperationalEventKind => {
  if (event.reversesEventId) return 'undo-recorded';
  const { eventType } = event;
  if (eventType.startsWith('assignment-')) return 'assignment-recorded';
  if (
    eventType === 'work-started'
    || eventType === 'crew-reported-complete'
  ) return 'crew-report-recorded';
  if (
    eventType === 'los-passed'
    || eventType === 'callback-resolved'
  ) return 'inspection-recorded';
  if (
    eventType.startsWith('callback-')
    || eventType === 'property-correction-requested'
  ) return 'callback-recorded';
  if (
    eventType.startsWith('property-')
    || eventType === 'walk-not-walked'
    || eventType === 'walk-deferred'
  ) return 'property-walk-recorded';
  if (
    eventType === 'paper-reviewed'
    || eventType === 'personal-pds-mirror-recorded'
  ) return 'reconciliation-recorded';
  return 'note-recorded';
};

const activityTitleFor = (event: FieldEvent): string => {
  const titleByType: Readonly<Record<string, string>> = {
    'assignment-cleared': 'Assignment cleared',
    'assignment-confirmed': 'Crew assignment confirmed',
    'callback-correction-reported': 'Callback correction reported',
    'callback-opened': 'Callback opened',
    'callback-resolved': 'Callback resolved',
    'crew-reported-complete': 'Crew reported complete',
    'daily-release-confirmed': 'Daily Release recorded',
    'day-assignment-evidence-reviewed': 'Assignment list reviewed',
    'day-session-closed': 'Day ended',
    'day-session-started': 'Day started',
    'day-walkthrough-schedule-recorded': 'Walkthrough schedule saved',
    'day-working-hours-recorded': 'Working hours saved',
    'los-passed': 'Los inspection passed',
    'paper-reviewed': 'Paper review recorded',
    'personal-pds-mirror-recorded': 'Personal PDS Approved mirror recorded',
    'project-activated': 'Project activated',
    'property-accepted': 'Property acceptance recorded',
    'property-correction-requested': 'Property correction requested',
    'walk-deferred': 'Property walk deferred',
    'walk-not-walked': 'Work not walked',
    'work-started': 'Work started',
  };
  return titleByType[event.eventType] ?? event.eventType.replaceAll('-', ' ');
};

export function adaptFieldEventToActivity(
  accountId: string,
  event: FieldEvent,
): TrackAFieldActivity {
  const sourceRef: OperationalSourceReference = {
    excerpt: event.summary,
    id: `field-event:${event.id}`,
    kind: 'operational-event',
    label: 'Personal Turn OS record',
  };
  return {
    accountId,
    boundary: event.boundary,
    eventKind: eventKindFor(event),
    id: `field:${event.id}`,
    projectId: event.projectId,
    recordedAt: event.recordedAt,
    section: event.section,
    sourceEventId: event.id,
    sourceRefs: [sourceRef],
    title: activityTitleFor(event),
    trade: event.trade,
    unitId: event.unitId,
    wording: event.summary,
  };
}

export function adaptDurableFieldEventsToActivity(input: {
  readonly accountId: string;
  readonly projectId: string;
  readonly daySessionId?: string;
  readonly fieldEvents: readonly FieldEvent[];
}): readonly TrackAFieldActivity[] {
  const seen = new Set<string>();
  return input.fieldEvents
    .filter((event) =>
      event.projectId === input.projectId
      && (!input.daySessionId || event.daySessionId === input.daySessionId))
    .filter((event) => {
      if (seen.has(event.id)) return false;
      seen.add(event.id);
      return true;
    })
    .map((event) => adaptFieldEventToActivity(input.accountId, event))
    .sort((left, right) =>
      right.recordedAt.localeCompare(left.recordedAt)
      || left.sourceEventId.localeCompare(right.sourceEventId));
}

export interface TrackAFieldActivityGroup extends TrackAFieldActivity {
  readonly groupedCount: number;
  readonly groupedSections: readonly string[];
}

export const ACTIVITY_BURST_WINDOW_MS = 15 * 60_000;

const SECTION_DISPLAY_ORDER = ['common', 'A', 'B', 'C', 'D', 'E'];

const sectionOrder = (section: string) => {
  const index = SECTION_DISPLAY_ORDER.indexOf(section);
  return index === -1 ? SECTION_DISPLAY_ORDER.length : index;
};

// One bulk action (assign a crew, start work, walk a unit) emits one event per
// section, but Los reads the feed at Unit + Trade grain. Merge same-titled
// events for the same unit and trade recorded within one burst window into a
// single row; the underlying event log is never mutated.
export function groupFieldActivityBursts(
  items: readonly TrackAFieldActivity[],
  windowMs: number = ACTIVITY_BURST_WINDOW_MS,
): readonly TrackAFieldActivityGroup[] {
  interface OpenGroup {
    count: number;
    head: TrackAFieldActivity;
    oldestMs: number;
    sections: string[];
  }
  const groups: OpenGroup[] = [];
  const open = new Map<string, OpenGroup>();
  for (const item of items) {
    const key = item.unitId
      ? `${item.unitId}:${item.trade ?? ''}:${item.title}`
      : undefined;
    const recordedMs = Date.parse(item.recordedAt);
    const existing = key ? open.get(key) : undefined;
    if (existing && existing.oldestMs - recordedMs <= windowMs) {
      existing.count += 1;
      existing.oldestMs = Math.min(existing.oldestMs, recordedMs);
      if (item.section && !existing.sections.includes(item.section)) {
        existing.sections.push(item.section);
      }
      continue;
    }
    const created: OpenGroup = {
      count: 1,
      head: item,
      oldestMs: recordedMs,
      sections: item.section ? [item.section] : [],
    };
    groups.push(created);
    if (key) open.set(key, created);
  }
  return groups.map((group) => ({
    ...group.head,
    groupedCount: group.count,
    groupedSections: [...group.sections]
      .sort((left, right) => sectionOrder(left) - sectionOrder(right)),
    section: group.count > 1 ? undefined : group.head.section,
  }));
}

export function adaptLegacyActivityLogsToActivity(input: {
  readonly accountId: string;
  readonly projectId: string;
  readonly activityLogs: readonly ActivityLog[];
}): readonly TrackAFieldActivity[] {
  const seen = new Set<string>();
  return input.activityLogs
    .filter((activity) => activity.projectId === input.projectId)
    .filter((activity) => {
      if (seen.has(activity.id)) return false;
      seen.add(activity.id);
      return true;
    })
    .map((activity): TrackAFieldActivity => ({
      accountId: input.accountId,
      boundary: 'personal-record',
      eventKind: 'note-recorded',
      id: `legacy:${activity.id}`,
      projectId: activity.projectId,
      recordedAt: activity.createdAt,
      sourceEventId: `legacy:${activity.id}`,
      sourceRefs: [{
        excerpt: activity.note,
        id: `activity:${activity.id}`,
        kind: 'app-data-record',
        label: 'Personal Turn OS record',
      }],
      title: activity.action,
      unitId: activity.entityType === 'Unit' ? activity.entityId : undefined,
      wording: activity.note,
    }))
    .sort((left, right) =>
      right.recordedAt.localeCompare(left.recordedAt)
      || left.sourceEventId.localeCompare(right.sourceEventId));
}
