import type { AppData, Project, Unit } from '../../types';
import {
  createJul28AppDataTurnBoardRepository,
  type Jul28AppDataRepositoryErrorCode,
  type Jul28AppDataTurnBoardRepository,
} from '../jul28-turnboard/adapters/appDataRepository';
import {
  OperationalScopeError,
  type ActivityItem,
  type ApprovedKnowledgeRecord,
  type OperationalScope,
  type OperationalSourceReference,
} from './contracts';

export interface AppDataPropertySummary {
  readonly projectId: string;
  readonly propertyName: string;
  readonly location: string;
  readonly mode: Project['mode'];
  readonly startDate: string;
  readonly endDate: string;
  readonly unitCount: number;
  readonly openIssueCount: number;
  readonly sourceRefs: readonly OperationalSourceReference[];
}

export interface AppDataUnitReadRecord {
  readonly id: string;
  readonly unitNumber: string;
  readonly unitTypeLabel: string;
  readonly buildingLabel: string;
  readonly floorLabel: string;
  readonly legacyPersonalStatuses: {
    readonly overall: Unit['overallStatus'];
    readonly paint: Unit['paintStatus'];
    readonly clean: Unit['cleanStatus'];
    readonly inspection: Unit['inspectionStatus'];
  };
  readonly statusBoundary: 'legacy-whole-unit-personal-summary-not-section-truth';
  readonly sourceRefs: readonly OperationalSourceReference[];
}

export interface AppDataNeedsMeRecord {
  readonly id: string;
  readonly unitId?: string;
  readonly reason: string;
  readonly owner: string;
  readonly priority: string;
  readonly sourceRefs: readonly OperationalSourceReference[];
}

export interface AppDataCrewAssignmentRecord {
  readonly id: string;
  readonly crewLabel: string;
  readonly trade: string;
  readonly unitIds: readonly string[];
  readonly status: string;
  readonly scopeText: string;
  readonly sectionCoverage: 'not-recorded-in-app-data';
  readonly sourceRefs: readonly OperationalSourceReference[];
}

export interface AppDataOperationalReadSource {
  readonly scope: OperationalScope;
  readonly sourceKind: 'personal-app-data';
  readonly sourceLabel: string;
  readonly getPropertySummary: () => AppDataPropertySummary;
  readonly searchUnits: (query: string) => readonly AppDataUnitReadRecord[];
  readonly getUnit: (selector: { readonly unitId?: string; readonly unitNumber?: string }) =>
    AppDataUnitReadRecord | undefined;
  readonly listNeedsMe: () => readonly AppDataNeedsMeRecord[];
  readonly listCrewAssignments: () => readonly AppDataCrewAssignmentRecord[];
  readonly listLegacyActivity: () => readonly ActivityItem[];
  readonly listApprovedKnowledge: () => readonly ApprovedKnowledgeRecord[];
}

export type AppDataOperationalReadSourceErrorCode =
  | 'scope-missing'
  | 'active-project-scope-mismatch'
  | Jul28AppDataRepositoryErrorCode;

export type AppDataOperationalReadSourceResult =
  | { readonly ok: true; readonly source: AppDataOperationalReadSource }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: AppDataOperationalReadSourceErrorCode;
        readonly message: string;
        readonly details: readonly string[];
      };
    };

const freeze = <Value>(value: Value): Value => {
  const copy = structuredClone(value);
  const walk = (candidate: unknown): void => {
    if (!candidate || typeof candidate !== 'object' || Object.isFrozen(candidate)) return;
    for (const nested of Object.values(candidate as Record<string, unknown>)) walk(nested);
    Object.freeze(candidate);
  };
  walk(copy);
  return copy;
};

const failure = (
  code: AppDataOperationalReadSourceErrorCode,
  message: string,
  details: readonly string[] = [],
): AppDataOperationalReadSourceResult => freeze({
  ok: false,
  error: { code, message, details },
});

const appDataRef = (
  kind: string,
  id: string,
  label: string,
  excerpt?: string,
): OperationalSourceReference => ({
  kind: 'app-data-record',
  id: `app-data:${kind}:${id}`,
  label,
  excerpt,
});

const mapUnit = (
  unit: Unit,
  turnBoardRepository: Jul28AppDataTurnBoardRepository,
): AppDataUnitReadRecord => {
  const identity = turnBoardRepository.getUnit(unit.id);
  if (!identity) {
    throw new Error(`The AppData TurnBoard adapter did not expose active-project Unit ${unit.id}.`);
  }
  return freeze({
    id: unit.id,
    unitNumber: unit.unitNumber,
    unitTypeLabel: identity.unitTypeLabel,
    buildingLabel: identity.buildingLabel,
    floorLabel: identity.floorLabel,
    legacyPersonalStatuses: {
      overall: unit.overallStatus,
      paint: unit.paintStatus,
      clean: unit.cleanStatus,
      inspection: unit.inspectionStatus,
    },
    statusBoundary: 'legacy-whole-unit-personal-summary-not-section-truth' as const,
    sourceRefs: [appDataRef('unit', unit.id, `Personal AppData Unit ${unit.unitNumber}`)],
  });
};

export const createAppDataOperationalReadSource = (
  scope: OperationalScope,
  data: Readonly<AppData>,
): AppDataOperationalReadSourceResult => {
  if (!scope.accountId.trim() || !scope.projectId.trim()) {
    return failure('scope-missing', 'AppData access requires explicit account and project scope.');
  }
  if (data.activeProjectId !== scope.projectId) {
    return failure(
      'active-project-scope-mismatch',
      'The requested project is not the active project in the injected AppData snapshot.',
      [scope.projectId, data.activeProjectId],
    );
  }

  const adapterResult = createJul28AppDataTurnBoardRepository(data);
  if (!adapterResult.ok) {
    return failure(adapterResult.error.code, adapterResult.error.message, adapterResult.error.details);
  }

  const project = data.projects.find((candidate) => candidate.id === scope.projectId);
  if (!project) {
    return failure('active-project-not-found', 'The requested AppData project does not exist.', [scope.projectId]);
  }

  const activeUnits = data.units.filter((unit) => unit.projectId === scope.projectId);
  const units = freeze(activeUnits.map((unit) => mapUnit(unit, adapterResult.repository)));
  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const unitByNumber = new Map(units.map((unit) => [unit.unitNumber.trim().toLocaleLowerCase(), unit]));
  const unitProjectById = new Map(data.units.map((unit) => [unit.id, unit.projectId]));
  const sourceLabel = adapterResult.repository.sourceLabel;
  const openIssues = data.issues.filter((issue) =>
    issue.projectId === project.id && issue.status !== 'Resolved' && issue.status !== 'Closed'
  );
  const propertySummary = freeze<AppDataPropertySummary>({
    projectId: project.id,
    propertyName: project.propertyName,
    location: project.location,
    mode: project.mode,
    startDate: project.startDate,
    endDate: project.endDate,
    unitCount: activeUnits.length,
    openIssueCount: openIssues.length,
    sourceRefs: [appDataRef('project', project.id, `Personal AppData project ${project.propertyName}`)],
  });
  const needsMe = freeze(openIssues.map((issue): AppDataNeedsMeRecord => ({
    id: issue.id,
    unitId: issue.unitId,
    reason: issue.title,
    owner: issue.owner,
    priority: issue.priority,
    sourceRefs: [appDataRef('issue', issue.id, `Personal AppData issue: ${issue.title}`)],
  })));
  const crewAssignments = freeze(data.assignments
    .filter((assignment) => assignment.projectId === project.id)
    .map((assignment): AppDataCrewAssignmentRecord => ({
      id: assignment.id,
      crewLabel: assignment.teamName,
      trade: assignment.trade,
      unitIds: [...assignment.unitIds],
      status: assignment.status,
      scopeText: assignment.scope,
      sectionCoverage: 'not-recorded-in-app-data',
      sourceRefs: [appDataRef('assignment', assignment.id, `Personal AppData assignment: ${assignment.teamName}`)],
    })));
  const legacyActivity = freeze(data.activityLogs
    .filter((activity) => activity.projectId === project.id)
    .map((activity): ActivityItem => ({
      id: `legacy:${activity.id}`,
      accountId: scope.accountId,
      projectId: scope.projectId,
      eventKind: 'note-recorded',
      unitId: activity.entityType === 'Unit' ? activity.entityId : undefined,
      title: activity.action,
      wording: activity.note,
      recordedAt: activity.createdAt,
      sourceRefs: [appDataRef('activity', activity.id, `Legacy personal Activity: ${activity.action}`)],
    })));
  const approvedKnowledge = freeze(data.memories
    .filter((memory) => memory.approved && memory.projectId === project.id)
    .map((memory): ApprovedKnowledgeRecord => ({
      id: `app-data-memory:${memory.id}`,
      accountId: scope.accountId,
      projectId: scope.projectId,
      statement: memory.content,
      category: memory.memoryType === 'Crew Memory'
        ? 'crew'
        : memory.memoryType === 'Property Memory'
          ? 'property'
          : memory.memoryType === 'Personal Supervisor Preference'
            ? 'personal-preference'
            : 'workflow',
      approvedBy: 'los',
      approvedAt: memory.updatedAt,
      active: true,
      sourceRefs: [appDataRef(
        'memory',
        memory.id,
        `Approved personal AppData memory: ${memory.memoryType}`,
        memory.source,
      )],
    })));

  const source: AppDataOperationalReadSource = {
    scope: freeze(scope),
    sourceKind: 'personal-app-data',
    sourceLabel,
    getPropertySummary: () => propertySummary,
    searchUnits: (query) => {
      const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
      if (tokens.length === 0) return units;
      return freeze(units.filter((unit) => {
        const searchable = [
          unit.unitNumber,
          unit.unitTypeLabel,
          unit.buildingLabel,
          unit.floorLabel,
        ].join(' ').toLocaleLowerCase();
        return tokens.every((token) => searchable.includes(token));
      }));
    },
    getUnit: ({ unitId, unitNumber }) => {
      if (unitId) {
        const anyProjectId = unitProjectById.get(unitId);
        if (anyProjectId && anyProjectId !== scope.projectId) {
          throw new OperationalScopeError(`Unit ${unitId} belongs to another project.`);
        }
        return unitById.get(unitId);
      }
      if (!unitNumber) return undefined;
      return unitByNumber.get(unitNumber.trim().toLocaleLowerCase());
    },
    listNeedsMe: () => needsMe,
    listCrewAssignments: () => crewAssignments,
    listLegacyActivity: () => legacyActivity,
    listApprovedKnowledge: () => approvedKnowledge,
  };

  Object.freeze(source);
  return Object.freeze({ ok: true as const, source });
};
