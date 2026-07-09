import type {
  AgentEntityType,
  AgentRun,
  AppData,
  CopilotConversation,
  DraftAction,
  FollowUpTask,
} from '../types';

const optionalString = (value: unknown) =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined;

const uniqueProjectId = (projectIds: Iterable<string | undefined>) => {
  const unique = new Set([...projectIds].filter((projectId): projectId is string => Boolean(projectId)));
  return unique.size === 1 ? [...unique][0] : undefined;
};

const addProjectId = (index: Map<string, Set<string>>, key: string, projectId: string | undefined) => {
  if (!projectId) {
    return;
  }
  const projectIds = index.get(key) ?? new Set<string>();
  projectIds.add(projectId);
  index.set(key, projectIds);
};

const draftBatchId = (draft: DraftAction) => optionalString(draft.payload.captureBatchId);

export const createProjectScopeResolver = (data: AppData) => {
  const entityProjects = new Map<string, Set<string>>();
  const activityProjects = new Map<string, Set<string>>();
  const entityKey = (entityType: AgentEntityType, entityId: string) => `${entityType}:${entityId}`;
  const activityKey = (entityType: AppData['activityLogs'][number]['entityType'], entityId: string) =>
    `${entityType}:${entityId}`;

  data.projects.forEach((project) => addProjectId(entityProjects, entityKey('project', project.id), project.id));
  data.buildings.forEach((building) => addProjectId(entityProjects, entityKey('building', building.id), building.projectId));
  data.floors.forEach((floor) => {
    const buildingId = floor.buildingId;
    const projectId = uniqueProjectId(entityProjects.get(entityKey('building', buildingId)) ?? []);
    addProjectId(entityProjects, entityKey('floor', floor.id), projectId);
  });
  data.units.forEach((unit) => addProjectId(entityProjects, entityKey('unit', unit.id), unit.projectId));
  data.crewMembers.forEach((crew) => addProjectId(entityProjects, entityKey('crew', crew.id), crew.projectId));
  data.assignments.forEach((assignment) =>
    addProjectId(entityProjects, entityKey('assignment', assignment.id), assignment.projectId),
  );
  data.issues.forEach((issue) => addProjectId(entityProjects, entityKey('issue', issue.id), issue.projectId));
  data.dailyLogs.forEach((log) => addProjectId(entityProjects, entityKey('dailyLog', log.id), log.projectId));
  data.memories.forEach((memory) => addProjectId(entityProjects, entityKey('memory', memory.id), memory.projectId));
  data.reportDrafts.forEach((report) => addProjectId(entityProjects, entityKey('report', report.id), report.projectId));
  data.activityLogs.forEach((log) => addProjectId(activityProjects, activityKey(log.entityType, log.entityId), log.projectId));

  const entityProjectId = (entityType: AgentEntityType, entityId: string | undefined) => {
    if (!entityId) {
      return undefined;
    }
    if (entityType === 'followUpTask') {
      return uniqueProjectId(activityProjects.get(activityKey('FollowUpTask', entityId)) ?? []);
    }
    if (entityType === 'trainingQuestion') {
      return uniqueProjectId(activityProjects.get(activityKey('TrainingQuestion', entityId)) ?? []);
    }
    return uniqueProjectId(entityProjects.get(entityKey(entityType, entityId)) ?? []);
  };

  const batchProjects = new Map<string, Set<string>>();
  data.draftActions.forEach((draft) => {
    const batchId = draftBatchId(draft);
    if (!batchId) {
      return;
    }
    const directProjects = activityProjects.get(activityKey('DraftAction', draft.id)) ?? [];
    directProjects.forEach((projectId) => addProjectId(batchProjects, batchId, projectId));
  });

  const draftActionProjectId = (draft: DraftAction) =>
    uniqueProjectId([
      optionalString(draft.payload.captureProjectId),
      entityProjectId(draft.targetEntityType, draft.targetEntityId),
      uniqueProjectId(activityProjects.get(activityKey('DraftAction', draft.id)) ?? []),
      uniqueProjectId(batchProjects.get(draftBatchId(draft) ?? '') ?? []),
    ]);

  const followUpTaskProjectId = (task: FollowUpTask) =>
    uniqueProjectId([
      task.relatedEntityType && task.relatedEntityId
        ? entityProjectId(task.relatedEntityType, task.relatedEntityId)
        : undefined,
      uniqueProjectId(activityProjects.get(activityKey('FollowUpTask', task.id)) ?? []),
    ]);

  return { draftActionProjectId, entityProjectId, followUpTaskProjectId };
};

export const getEntityProjectId = (
  data: AppData,
  entityType: AgentEntityType,
  entityId: string | undefined,
) => createProjectScopeResolver(data).entityProjectId(entityType, entityId);

export const getDraftActionProjectId = (data: AppData, draft: DraftAction) =>
  createProjectScopeResolver(data).draftActionProjectId(draft);

export const getProjectDraftActions = (data: AppData, projectId: string) => {
  const resolver = createProjectScopeResolver(data);
  return data.draftActions.filter((draft) => resolver.draftActionProjectId(draft) === projectId);
};

export const getFollowUpTaskProjectId = (data: AppData, task: FollowUpTask) =>
  createProjectScopeResolver(data).followUpTaskProjectId(task);

export const getProjectFollowUpTasks = (data: AppData, projectId: string) => {
  const resolver = createProjectScopeResolver(data);
  return data.followUpTasks.filter((task) => resolver.followUpTaskProjectId(task) === projectId);
};

export const getProjectDailyLogs = (data: AppData, projectId: string) =>
  data.dailyLogs.filter((log) => log.projectId === projectId);

export const getProjectAgentRuns = (data: AppData, projectId: string): AgentRun[] =>
  data.agentRuns.filter((run) => run.projectId === projectId);

export const getProjectCopilotConversations = (data: AppData, projectId: string): CopilotConversation[] =>
  data.copilotConversations.filter((conversation) => conversation.projectId === projectId);
