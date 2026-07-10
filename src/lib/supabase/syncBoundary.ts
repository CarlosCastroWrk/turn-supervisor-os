import type {
  ActivityLog,
  AiUsageEvent,
  AppData,
  Assignment,
  CrewMember,
  DailyLog,
  DraftAction,
  FollowUpTask,
  Issue,
  Memory,
  MemoryCandidate,
  PhotoNote,
  Project,
  ReportDocumentDraft,
  TrainingQuestion,
  Unit,
} from '../../types';
import { isExplicitGlobalMemory } from '../memory';
import { createProjectScopeResolver } from '../projectScope';

export type SyncBoundaryKey =
  | 'projects'
  | 'buildings'
  | 'floors'
  | 'units'
  | 'crewMembers'
  | 'assignments'
  | 'issues'
  | 'photoNotes'
  | 'dailyLogs'
  | 'reportDrafts'
  | 'trainingQuestions'
  | 'activityLogs'
  | 'draftActions'
  | 'memories'
  | 'memoryCandidates'
  | 'followUpTasks'
  | 'aiUsageEvents';

export type SyncRemoteData = Partial<Record<SyncBoundaryKey, { id: string }[]>>;

interface DemoSyncBoundary {
  demoProjectIds: Set<string>;
  demoBuildingIds: Set<string>;
  demoFloorIds: Set<string>;
  demoUnitIds: Set<string>;
  demoCrewMemberIds: Set<string>;
  demoAssignmentIds: Set<string>;
  demoIssueIds: Set<string>;
  demoPhotoNoteIds: Set<string>;
  demoDailyLogIds: Set<string>;
  demoReportDraftIds: Set<string>;
  demoActivityLogIds: Set<string>;
  demoAiUsageEventIds: Set<string>;
  localOnlyDraftActionIds: Set<string>;
  localOnlyFollowUpTaskIds: Set<string>;
}

const appendMissingRows = <T extends { id: string }>(remoteRows: T[] | undefined, localRows: T[]) => {
  const remote = remoteRows ?? [];
  const remoteIds = new Set(remote.map((item) => item.id));
  return [...remote, ...localRows.filter((item) => !remoteIds.has(item.id))];
};

const isDemoEntityId = (boundary: DemoSyncBoundary, id: string | undefined) => {
  if (!id) {
    return false;
  }

  return (
    boundary.demoProjectIds.has(id) ||
    boundary.demoUnitIds.has(id) ||
    boundary.demoIssueIds.has(id) ||
    boundary.demoCrewMemberIds.has(id) ||
    boundary.demoBuildingIds.has(id) ||
    boundary.demoFloorIds.has(id) ||
    boundary.demoAssignmentIds.has(id) ||
    boundary.demoPhotoNoteIds.has(id) ||
    boundary.demoDailyLogIds.has(id) ||
    boundary.demoReportDraftIds.has(id)
  );
};

export const createDemoSyncBoundary = (data: AppData): DemoSyncBoundary => {
  const projectScope = createProjectScopeResolver(data);
  const demoProjectIds = new Set(data.projects.filter((project) => project.mode === 'demo').map((project) => project.id));
  const demoBuildingIds = new Set(
    data.buildings.filter((building) => demoProjectIds.has(building.projectId)).map((building) => building.id),
  );
  const demoFloorIds = new Set(
    data.floors.filter((floor) => demoBuildingIds.has(floor.buildingId)).map((floor) => floor.id),
  );
  const demoUnitIds = new Set(data.units.filter((unit) => demoProjectIds.has(unit.projectId)).map((unit) => unit.id));
  const demoCrewMemberIds = new Set(
    data.crewMembers.filter((crew) => crew.projectId && demoProjectIds.has(crew.projectId)).map((crew) => crew.id),
  );
  const demoAssignmentIds = new Set(
    data.assignments.filter((assignment) => demoProjectIds.has(assignment.projectId)).map((assignment) => assignment.id),
  );
  const demoIssueIds = new Set(data.issues.filter((issue) => demoProjectIds.has(issue.projectId)).map((issue) => issue.id));
  const demoPhotoNoteIds = new Set(
    data.photoNotes.filter((photo) => demoProjectIds.has(photo.projectId)).map((photo) => photo.id),
  );
  const demoDailyLogIds = new Set(data.dailyLogs.filter((log) => demoProjectIds.has(log.projectId)).map((log) => log.id));
  const demoReportDraftIds = new Set(
    data.reportDrafts.filter((draft) => demoProjectIds.has(draft.projectId)).map((draft) => draft.id),
  );
  const demoActivityLogIds = new Set(
    data.activityLogs.filter((log) => demoProjectIds.has(log.projectId)).map((log) => log.id),
  );
  const demoAiUsageEventIds = new Set(
    data.aiUsageEvents.filter((event) => demoProjectIds.has(event.projectId)).map((event) => event.id),
  );
  const localOnlyDraftActionIds = new Set(
    data.draftActions
      .filter((draft) => {
        const projectId = projectScope.draftActionProjectId(draft);
        return !projectId || demoProjectIds.has(projectId);
      })
      .map((draft) => draft.id),
  );
  const localOnlyFollowUpTaskIds = new Set(
    data.followUpTasks
      .filter((task) => {
        const projectId = projectScope.followUpTaskProjectId(task);
        return !projectId || demoProjectIds.has(projectId);
      })
      .map((task) => task.id),
  );

  return {
    demoProjectIds,
    demoBuildingIds,
    demoFloorIds,
    demoUnitIds,
    demoCrewMemberIds,
    demoAssignmentIds,
    demoIssueIds,
    demoPhotoNoteIds,
    demoDailyLogIds,
    demoReportDraftIds,
    demoActivityLogIds,
    demoAiUsageEventIds,
    localOnlyDraftActionIds,
    localOnlyFollowUpTaskIds,
  };
};

export const isDemoScopedSyncItem = (
  boundary: DemoSyncBoundary,
  key: SyncBoundaryKey,
  item: { id: string },
) => {
  switch (key) {
    case 'projects':
      return boundary.demoProjectIds.has(item.id);
    case 'buildings':
      return boundary.demoBuildingIds.has(item.id);
    case 'floors':
      return boundary.demoFloorIds.has(item.id);
    case 'units':
      return boundary.demoUnitIds.has(item.id);
    case 'crewMembers':
      return boundary.demoCrewMemberIds.has(item.id);
    case 'assignments':
      return boundary.demoAssignmentIds.has(item.id);
    case 'issues':
      return boundary.demoIssueIds.has(item.id);
    case 'photoNotes':
      return boundary.demoPhotoNoteIds.has(item.id);
    case 'dailyLogs':
      return boundary.demoDailyLogIds.has(item.id);
    case 'reportDrafts':
      return boundary.demoReportDraftIds.has(item.id);
    case 'activityLogs':
      return boundary.demoActivityLogIds.has(item.id);
    case 'draftActions': {
      return boundary.localOnlyDraftActionIds.has(item.id);
    }
    case 'memories': {
      const memory = item as Memory;
      if (memory.projectId) {
        return boundary.demoProjectIds.has(memory.projectId);
      }
      if (isDemoEntityId(boundary, memory.sourceEntityId)) {
        return true;
      }
      return !isExplicitGlobalMemory(memory);
    }
    case 'memoryCandidates': {
      const candidate = item as MemoryCandidate;
      return !candidate.projectId || boundary.demoProjectIds.has(candidate.projectId);
    }
    case 'followUpTasks': {
      return boundary.localOnlyFollowUpTaskIds.has(item.id);
    }
    case 'aiUsageEvents':
      return boundary.demoAiUsageEventIds.has(item.id);
    case 'trainingQuestions':
      return false;
    default:
      return false;
  }
};

export const filterUploadableSyncItems = <T extends { id: string }>(
  data: AppData,
  key: SyncBoundaryKey,
  items: T[],
) => {
  const boundary = createDemoSyncBoundary(data);
  return items.filter((item) => !isDemoScopedSyncItem(boundary, key, item));
};

export const withLocalDemoRows = (local: AppData, remote: SyncRemoteData): SyncRemoteData => {
  const boundary = createDemoSyncBoundary(local);

  return {
    ...remote,
    projects: appendMissingRows(remote.projects as Project[] | undefined, local.projects.filter((project) => boundary.demoProjectIds.has(project.id))),
    buildings: appendMissingRows(
      remote.buildings as AppData['buildings'] | undefined,
      local.buildings.filter((building) => boundary.demoBuildingIds.has(building.id)),
    ),
    floors: appendMissingRows(
      remote.floors as AppData['floors'] | undefined,
      local.floors.filter((floor) => boundary.demoFloorIds.has(floor.id)),
    ),
    units: appendMissingRows(remote.units as Unit[] | undefined, local.units.filter((unit) => boundary.demoUnitIds.has(unit.id))),
    crewMembers: appendMissingRows(
      remote.crewMembers as CrewMember[] | undefined,
      local.crewMembers.filter((crew) => boundary.demoCrewMemberIds.has(crew.id)),
    ),
    assignments: appendMissingRows(
      remote.assignments as Assignment[] | undefined,
      local.assignments.filter((assignment) => boundary.demoAssignmentIds.has(assignment.id)),
    ),
    issues: appendMissingRows(remote.issues as Issue[] | undefined, local.issues.filter((issue) => boundary.demoIssueIds.has(issue.id))),
    photoNotes: appendMissingRows(
      remote.photoNotes as PhotoNote[] | undefined,
      local.photoNotes.filter((photo) => boundary.demoPhotoNoteIds.has(photo.id)),
    ),
    dailyLogs: appendMissingRows(
      remote.dailyLogs as DailyLog[] | undefined,
      local.dailyLogs.filter((log) => boundary.demoDailyLogIds.has(log.id)),
    ),
    reportDrafts: appendMissingRows(
      remote.reportDrafts as ReportDocumentDraft[] | undefined,
      local.reportDrafts.filter((draft) => boundary.demoReportDraftIds.has(draft.id)),
    ),
    activityLogs: appendMissingRows(
      remote.activityLogs as ActivityLog[] | undefined,
      local.activityLogs.filter((log) => boundary.demoActivityLogIds.has(log.id)),
    ),
    draftActions: appendMissingRows(
      remote.draftActions as DraftAction[] | undefined,
      local.draftActions.filter((draft) => isDemoScopedSyncItem(boundary, 'draftActions', draft)),
    ),
    memories: appendMissingRows(
      remote.memories as Memory[] | undefined,
      local.memories.filter((memory) => isDemoScopedSyncItem(boundary, 'memories', memory)),
    ),
    memoryCandidates: appendMissingRows(
      remote.memoryCandidates as MemoryCandidate[] | undefined,
      local.memoryCandidates.filter((candidate) => isDemoScopedSyncItem(boundary, 'memoryCandidates', candidate)),
    ),
    followUpTasks: appendMissingRows(
      remote.followUpTasks as FollowUpTask[] | undefined,
      local.followUpTasks.filter((task) => isDemoScopedSyncItem(boundary, 'followUpTasks', task)),
    ),
    aiUsageEvents: appendMissingRows(
      remote.aiUsageEvents as AiUsageEvent[] | undefined,
      local.aiUsageEvents.filter((event) => isDemoScopedSyncItem(boundary, 'aiUsageEvents', event)),
    ),
    trainingQuestions: remote.trainingQuestions as TrainingQuestion[] | undefined,
  };
};
