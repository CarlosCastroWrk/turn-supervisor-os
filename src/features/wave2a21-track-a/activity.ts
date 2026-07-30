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
    'day-session-closed': 'Day ended',
    'day-session-started': 'Day started',
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
    label: `Confirmed personal field event · ${event.eventType}`,
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
        label: `Personal AppData Activity · ${activity.action}`,
      }],
      title: activity.action,
      unitId: activity.entityType === 'Unit' ? activity.entityId : undefined,
      wording: activity.note,
    }))
    .sort((left, right) =>
      right.recordedAt.localeCompare(left.recordedAt)
      || left.sourceEventId.localeCompare(right.sourceEventId));
}
