import {
  OperationalScopeError,
  type ActivityItem,
  type ApprovedKnowledgeRecord,
  type OperationalEvent,
  type OperationalMemoryRepositories,
  type OperationalScope,
  type OperationalSourceReference,
  scopesEqual,
} from './contracts';
import type {
  AppDataCrewAssignmentRecord,
  AppDataNeedsMeRecord,
  AppDataOperationalReadSource,
  AppDataPropertySummary,
  AppDataUnitReadRecord,
} from './appDataAdapter';
import { projectActivity, projectUnitHistory } from './activity';

export const APPROVED_READ_TOOL_NAMES = [
  'get_property_summary',
  'search_units',
  'get_unit',
  'get_unit_history',
  'get_needs_me',
  'get_daily_progress',
  'get_callbacks',
  'get_ready_for_walk',
  'get_crew_assignments',
  'get_approved_knowledge',
] as const;

export type ApprovedReadToolName = (typeof APPROVED_READ_TOOL_NAMES)[number];

const KNOWLEDGE_QUERY_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'for',
  'is',
  'of',
  'the',
  'to',
  'what',
]);

interface ScopedToolRequest<Input> {
  readonly scope: OperationalScope;
  readonly input: Input;
}

export interface NeedsMeReadRecord {
  readonly id: string;
  readonly unitId?: string;
  readonly reason: string;
  readonly owner?: string;
  readonly kind: 'legacy-issue' | 'blocker' | 'callback';
  readonly recordedAt?: string;
  readonly sourceRefs: readonly OperationalSourceReference[];
}

export interface CallbackReadRecord {
  readonly eventId: string;
  readonly unitId?: string;
  readonly trade?: string;
  readonly section?: string;
  readonly state: 'required' | 'correction-reported' | 'reinspection-pending';
  readonly reason: string;
  readonly recordedAt: string;
  readonly sourceRefs: readonly OperationalSourceReference[];
}

export interface ReadyForWalkReadRecord {
  readonly eventId: string;
  readonly unitId: string;
  readonly trade?: string;
  readonly section?: string;
  readonly basis: 'explicit-personal-walk-pending-record';
  readonly recordedAt: string;
  readonly sourceRefs: readonly OperationalSourceReference[];
}

export interface DailyProgressReadResult {
  readonly date: string;
  readonly goal: null;
  readonly goalCoverage: 'goal-owned-by-track-b-not-available-in-app-data';
  readonly deterministicCounts: {
    readonly crewReportedComplete: number;
    readonly losInspected: number;
    readonly readyForWalk: number;
    readonly propertyAccepted: number;
  };
  readonly sourceRefs: readonly OperationalSourceReference[];
}

export interface ApprovedReadTools {
  readonly get_property_summary: (
    request: ScopedToolRequest<Record<string, never>>,
  ) => AppDataPropertySummary;
  readonly search_units: (
    request: ScopedToolRequest<{ readonly query: string }>,
  ) => readonly AppDataUnitReadRecord[];
  readonly get_unit: (
    request: ScopedToolRequest<{ readonly unitId?: string; readonly unitNumber?: string }>,
  ) => AppDataUnitReadRecord | undefined;
  readonly get_unit_history: (
    request: ScopedToolRequest<{ readonly unitId: string }>,
  ) => readonly ActivityItem[];
  readonly get_needs_me: (
    request: ScopedToolRequest<Record<string, never>>,
  ) => readonly NeedsMeReadRecord[];
  readonly get_daily_progress: (
    request: ScopedToolRequest<{ readonly date: string }>,
  ) => DailyProgressReadResult;
  readonly get_callbacks: (
    request: ScopedToolRequest<Record<string, never>>,
  ) => readonly CallbackReadRecord[];
  readonly get_ready_for_walk: (
    request: ScopedToolRequest<Record<string, never>>,
  ) => readonly ReadyForWalkReadRecord[];
  readonly get_crew_assignments: (
    request: ScopedToolRequest<Record<string, never>>,
  ) => readonly AppDataCrewAssignmentRecord[];
  readonly get_approved_knowledge: (
    request: ScopedToolRequest<{ readonly query?: string }>,
  ) => readonly ApprovedKnowledgeRecord[];
}

const eventTargetKey = (event: OperationalEvent) => [
  event.target.unitId ?? 'property',
  event.target.trade ?? 'all-trades',
  event.target.section ?? 'all-sections',
].join(':');

const uniqueSourceRefs = (
  records: readonly { readonly sourceRefs: readonly OperationalSourceReference[] }[],
) => {
  const byId = new Map<string, OperationalSourceReference>();
  for (const record of records) {
    for (const reference of record.sourceRefs) byId.set(`${reference.kind}:${reference.id}`, reference);
  }
  return [...byId.values()];
};

const ensureScope = (expected: OperationalScope, actual: OperationalScope) => {
  if (!scopesEqual(expected, actual)) {
    throw new OperationalScopeError('Read tool request scope does not match its injected account/project source.');
  }
};

const latestCallbacks = (events: readonly OperationalEvent[]): readonly CallbackReadRecord[] => {
  const latest = new Map<string, OperationalEvent<'callback-recorded'>>();
  for (const event of events) {
    if (event.kind !== 'callback-recorded') continue;
    const current = latest.get(eventTargetKey(event));
    if (!current || event.recordedAt > current.recordedAt) latest.set(eventTargetKey(event), event);
  }
  const active: CallbackReadRecord[] = [];
  for (const event of latest.values()) {
    if (event.payload.state === 'cleared') continue;
    active.push({
      eventId: event.id,
      unitId: event.target.unitId,
      trade: event.target.trade,
      section: event.target.section,
      state: event.payload.state,
      reason: event.payload.reason,
      recordedAt: event.recordedAt,
      sourceRefs: event.sourceRefs,
    });
  }
  return active.sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));
};

const latestOpenBlockers = (events: readonly OperationalEvent[]) => {
  const latest = new Map<string, OperationalEvent<'blocker-recorded'>>();
  for (const event of events) {
    if (event.kind !== 'blocker-recorded') continue;
    const key = `${eventTargetKey(event)}:${event.payload.blockerKind}`;
    const current = latest.get(key);
    if (!current || event.recordedAt > current.recordedAt) latest.set(key, event);
  }
  return [...latest.values()].filter((event) => event.payload.state === 'opened');
};

const latestWalkStates = (events: readonly OperationalEvent[]) => {
  const latest = new Map<string, OperationalEvent<'property-walk-recorded'>>();
  for (const event of events) {
    if (event.kind !== 'property-walk-recorded' || !event.target.unitId) continue;
    const current = latest.get(event.target.unitId);
    if (!current || event.recordedAt > current.recordedAt) latest.set(event.target.unitId, event);
  }
  return [...latest.values()];
};

const uniqueTargetCount = (events: readonly OperationalEvent[]) =>
  new Set(events.map(eventTargetKey)).size;

const legacyIssueToNeedsMe = (record: AppDataNeedsMeRecord): NeedsMeReadRecord => ({
  id: `legacy-issue:${record.id}`,
  unitId: record.unitId,
  reason: record.reason,
  owner: record.owner,
  kind: 'legacy-issue',
  sourceRefs: record.sourceRefs,
});

export const createApprovedReadTools = (
  scope: OperationalScope,
  source: AppDataOperationalReadSource,
  repositories: OperationalMemoryRepositories,
): ApprovedReadTools => {
  ensureScope(scope, source.scope);

  const scopedEvents = () => repositories.events.list(scope);
  const check = (requestScope: OperationalScope) => ensureScope(scope, requestScope);

  return {
    get_property_summary: ({ scope: requestScope }) => {
      check(requestScope);
      return source.getPropertySummary();
    },
    search_units: ({ scope: requestScope, input }) => {
      check(requestScope);
      return source.searchUnits(input.query);
    },
    get_unit: ({ scope: requestScope, input }) => {
      check(requestScope);
      return source.getUnit(input);
    },
    get_unit_history: ({ scope: requestScope, input }) => {
      check(requestScope);
      const projected = projectUnitHistory(repositories.events, scope, input.unitId);
      const legacy = source.listLegacyActivity().filter((item) => item.unitId === input.unitId);
      return [...projected, ...legacy]
        .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));
    },
    get_needs_me: ({ scope: requestScope }) => {
      check(requestScope);
      const events = scopedEvents();
      const blockers: NeedsMeReadRecord[] = latestOpenBlockers(events).map((event) => ({
        id: `blocker:${event.id}`,
        unitId: event.target.unitId,
        reason: event.payload.description,
        owner: event.payload.ownerLabel,
        kind: 'blocker',
        recordedAt: event.recordedAt,
        sourceRefs: event.sourceRefs,
      }));
      const callbacks: NeedsMeReadRecord[] = latestCallbacks(events).map((callback) => ({
        id: `callback:${callback.eventId}`,
        unitId: callback.unitId,
        reason: callback.reason,
        kind: 'callback',
        recordedAt: callback.recordedAt,
        sourceRefs: callback.sourceRefs,
      }));
      return [
        ...source.listNeedsMe().map(legacyIssueToNeedsMe),
        ...blockers,
        ...callbacks,
      ];
    },
    get_daily_progress: ({ scope: requestScope, input }) => {
      check(requestScope);
      const events = scopedEvents().filter((event) => event.recordedAt.startsWith(input.date));
      const crewReportedComplete = events.filter((event) =>
        event.kind === 'crew-report-recorded' && event.payload.report === 'crew-reported-complete'
      );
      const losInspected = events.filter((event) =>
        event.kind === 'inspection-recorded' && event.payload.result === 'passed'
      );
      const walkEvents = latestWalkStates(events);
      const readyForWalk = walkEvents.filter((event) => event.payload.outcome === 'walk-pending');
      const propertyAccepted = walkEvents.filter((event) => event.payload.outcome === 'property-accepted');
      return {
        date: input.date,
        goal: null,
        goalCoverage: 'goal-owned-by-track-b-not-available-in-app-data',
        deterministicCounts: {
          crewReportedComplete: uniqueTargetCount(crewReportedComplete),
          losInspected: uniqueTargetCount(losInspected),
          readyForWalk: new Set(readyForWalk.map((event) => event.target.unitId)).size,
          propertyAccepted: new Set(propertyAccepted.map((event) => event.target.unitId)).size,
        },
        sourceRefs: uniqueSourceRefs(events),
      };
    },
    get_callbacks: ({ scope: requestScope }) => {
      check(requestScope);
      return latestCallbacks(scopedEvents());
    },
    get_ready_for_walk: ({ scope: requestScope }) => {
      check(requestScope);
      return latestWalkStates(scopedEvents())
        .filter((event) => event.payload.outcome === 'walk-pending' && Boolean(event.target.unitId))
        .map((event): ReadyForWalkReadRecord => ({
          eventId: event.id,
          unitId: event.target.unitId as string,
          trade: event.target.trade,
          section: event.target.section,
          basis: 'explicit-personal-walk-pending-record',
          recordedAt: event.recordedAt,
          sourceRefs: event.sourceRefs,
        }));
    },
    get_crew_assignments: ({ scope: requestScope }) => {
      check(requestScope);
      return source.listCrewAssignments();
    },
    get_approved_knowledge: ({ scope: requestScope, input }) => {
      check(requestScope);
      const queryTokens = (input.query ?? '')
        .trim()
        .toLocaleLowerCase()
        .split(/\s+/)
        .map((token) => token.replace(/[^a-z0-9-]/g, ''))
        .filter((token) => token && !KNOWLEDGE_QUERY_STOP_WORDS.has(token));
      const all = [
        ...source.listApprovedKnowledge(),
        ...repositories.knowledge.list(scope).filter((knowledge) => knowledge.active),
      ];
      const unique = [...new Map(all.map((knowledge) => [knowledge.id, knowledge])).values()];
      if (queryTokens.length === 0) return unique;
      return unique.filter((knowledge) => {
        const searchable = `${knowledge.category} ${knowledge.statement}`.toLocaleLowerCase();
        return queryTokens.every((token) => searchable.includes(token));
      });
    },
  };
};

export const listOperationalActivity = (
  scope: OperationalScope,
  repositories: OperationalMemoryRepositories,
  source: AppDataOperationalReadSource,
) => [
  ...projectActivity(repositories.events, scope),
  ...source.listLegacyActivity(),
].sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));
