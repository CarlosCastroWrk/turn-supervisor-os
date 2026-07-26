import type {
  ActivityAuthorityLayer,
  TurnActivityEvent,
  TurnActivityEventType,
} from './contracts.js';

const EVENT_LAYERS: Record<TurnActivityEventType, ActivityAuthorityLayer> = {
  'assignment-released': 'authorization',
  'assignment-scope-added': 'authorization',
  'assignment-conflict-recorded': 'authorization',
  'access-restriction-recorded': 'access',
  'access-restored': 'access',
  'crew-assigned': 'crew-execution',
  'crew-work-started': 'crew-execution',
  'crew-reported-complete': 'crew-execution',
  'los-inspection-passed': 'los-inspection',
  'callback-required': 'los-inspection',
  'reinspection-pending': 'los-inspection',
  'passed-after-callback': 'los-inspection',
  'property-walk-pending': 'property-walk',
  'property-accepted': 'property-walk',
  'property-rejected': 'property-walk',
  'paper-review-needed': 'paper-reconciliation',
  'paper-reviewed': 'paper-reconciliation',
};

const ACTIVITY_LAYERS: ActivityAuthorityLayer[] = [
  'authorization',
  'access',
  'crew-execution',
  'los-inspection',
  'property-walk',
  'paper-reconciliation',
];

const eventTime = (event: TurnActivityEvent) => {
  const parsed = Date.parse(event.occurredAt);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const getActivityAuthorityLayer = (eventType: TurnActivityEventType) => EVENT_LAYERS[eventType];

export interface ActivityEventProjection {
  timeline: Array<TurnActivityEvent & { authorityLayer: ActivityAuthorityLayer }>;
  countsByLayer: Record<ActivityAuthorityLayer, number>;
  countsByType: Partial<Record<TurnActivityEventType, number>>;
}

export const projectActivityEvents = (events: TurnActivityEvent[]): ActivityEventProjection => {
  const seenIds = new Set<string>();
  const timeline = [...events]
    .sort((left, right) => eventTime(left) - eventTime(right) || left.id.localeCompare(right.id))
    .filter((event) => {
      if (seenIds.has(event.id)) return false;
      seenIds.add(event.id);
      return true;
    })
    .map((event) => ({ ...event, authorityLayer: getActivityAuthorityLayer(event.eventType) }));

  const countsByLayer = Object.fromEntries(ACTIVITY_LAYERS.map((layer) => [layer, 0])) as Record<
    ActivityAuthorityLayer,
    number
  >;
  const countsByType: Partial<Record<TurnActivityEventType, number>> = {};

  timeline.forEach((event) => {
    countsByLayer[event.authorityLayer] += 1;
    countsByType[event.eventType] = (countsByType[event.eventType] ?? 0) + 1;
  });

  return { timeline, countsByLayer, countsByType };
};
