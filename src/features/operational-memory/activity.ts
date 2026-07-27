import type {
  ActivityItem,
  OperationalEvent,
  OperationalScope,
  ScopedReadRepository,
} from './contracts';

export interface OperationalActivityRepository {
  readonly listActivity: (scope: OperationalScope) => readonly ActivityItem[];
  readonly listUnitHistory: (scope: OperationalScope, unitId: string) => readonly ActivityItem[];
}

const eventToActivity = (event: OperationalEvent): ActivityItem => ({
  id: event.id,
  accountId: event.accountId,
  projectId: event.projectId,
  eventKind: event.kind,
  unitId: event.target.unitId,
  trade: event.target.trade,
  section: event.target.section,
  title: event.title,
  wording: event.wording,
  recordedAt: event.recordedAt,
  sourceRefs: event.sourceRefs,
});

const newestFirst = (left: ActivityItem, right: ActivityItem) =>
  right.recordedAt.localeCompare(left.recordedAt) || right.id.localeCompare(left.id);

export const projectActivity = (
  repository: ScopedReadRepository<OperationalEvent>,
  scope: OperationalScope,
): readonly ActivityItem[] => repository.list(scope).map(eventToActivity).sort(newestFirst);

export const projectUnitHistory = (
  repository: ScopedReadRepository<OperationalEvent>,
  scope: OperationalScope,
  unitId: string,
): readonly ActivityItem[] => projectActivity(repository, scope)
  .filter((item) => item.unitId === unitId);

export const createOperationalActivityRepository = (
  events: ScopedReadRepository<OperationalEvent>,
): OperationalActivityRepository => ({
  listActivity: (scope) => projectActivity(events, scope),
  listUnitHistory: (scope, unitId) => projectUnitHistory(events, scope, unitId),
});
