import type {
  AppData,
  AiUsageEvent,
  Assignment,
  Building,
  CrewMember,
  Floor,
  Memory,
  MemoryCandidate,
  PhotoNote,
  Project,
  ReportDocumentDraft,
} from '../types';
import { applyActivityLogRetention } from './activityRetention';
import { UNIT_WORKFLOW_STATUSES } from './constants';
import { DEFAULT_TURN_AI_BUDGET_USD } from './ai/usage';

const DEMO_PROJECT_ID = 'project_west_campus_turn';

const arrayOrEmpty = <T>(value: T[] | undefined): T[] => (Array.isArray(value) ? value : []);

const normalizeProject = (project: Project): Project => ({
  ...project,
  mode: project.mode === 'real' ? 'real' : 'demo',
  aiBudgetUsd:
    Number.isFinite(project.aiBudgetUsd) && project.aiBudgetUsd >= 0
      ? project.aiBudgetUsd
      : DEFAULT_TURN_AI_BUDGET_USD,
  archivedAt: typeof project.archivedAt === 'string' && project.archivedAt.length > 0 ? project.archivedAt : undefined,
});

const fallbackStamp = (createdAt?: string, updatedAt?: string) => updatedAt || createdAt || new Date(0).toISOString();

const normalizeBuilding = (building: Building): Building => ({
  ...building,
  createdAt: building.createdAt || fallbackStamp(undefined, building.updatedAt),
  updatedAt: fallbackStamp(building.createdAt, building.updatedAt),
});

const normalizeFloor = (floor: Floor): Floor => ({
  ...floor,
  createdAt: floor.createdAt || fallbackStamp(undefined, floor.updatedAt),
  updatedAt: fallbackStamp(floor.createdAt, floor.updatedAt),
});

const normalizeAssignment = (assignment: Assignment): Assignment => ({
  ...assignment,
  createdAt: assignment.createdAt || fallbackStamp(undefined, assignment.updatedAt),
  updatedAt: fallbackStamp(assignment.createdAt, assignment.updatedAt),
});

const normalizePhotoNote = (photo: PhotoNote): PhotoNote => ({
  ...photo,
  updatedAt: fallbackStamp(photo.createdAt, photo.updatedAt),
});

const normalizeAiUsageEvent = (event: AiUsageEvent): AiUsageEvent => ({
  ...event,
  inputTokens: Math.max(0, Number.isFinite(event.inputTokens) ? event.inputTokens : 0),
  cachedInputTokens: Math.max(0, Number.isFinite(event.cachedInputTokens) ? event.cachedInputTokens : 0),
  outputTokens: Math.max(0, Number.isFinite(event.outputTokens) ? event.outputTokens : 0),
  totalTokens: Math.max(0, Number.isFinite(event.totalTokens) ? event.totalTokens : 0),
  estimatedCostUsd: Math.max(0, Number.isFinite(event.estimatedCostUsd) ? event.estimatedCostUsd : 0),
  createdAt: event.createdAt || fallbackStamp(undefined, event.updatedAt),
  updatedAt: fallbackStamp(event.createdAt, event.updatedAt),
});

const normalizeReportDraft = (draft: ReportDocumentDraft): ReportDocumentDraft => ({
  ...draft,
  titleEdited: draft.titleEdited === true,
  summaryEdited: draft.summaryEdited === true,
  sections: arrayOrEmpty(draft.sections).map((section) => ({
    title: typeof section.title === 'string' ? section.title : '',
    subtitle: typeof section.subtitle === 'string' ? section.subtitle : '',
    body: typeof section.body === 'string' ? section.body : '',
    bodyEdited: section.bodyEdited === true,
  })),
  createdAt: draft.createdAt || fallbackStamp(undefined, draft.updatedAt),
  updatedAt: fallbackStamp(draft.createdAt, draft.updatedAt),
});

const pickActiveProjectId = (projects: Project[], currentActiveProjectId: string) => {
  if (projects.length === 0) {
    return currentActiveProjectId;
  }

  const visibleProjects = projects.filter((project) => !project.archivedAt);
  const activeProject = visibleProjects.find((project) => project.id === currentActiveProjectId);
  const realProjects = visibleProjects
    .filter((project) => project.mode === 'real')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  if (!activeProject) {
    return realProjects[0]?.id ?? visibleProjects[0]?.id ?? projects[0].id;
  }

  if (activeProject.id === DEMO_PROJECT_ID && realProjects.length > 0) {
    return realProjects[0].id;
  }

  return activeProject.id;
};

const normalizeCrew = (crew: CrewMember, demoProjectId: string | undefined, activeProjectId: string): CrewMember => {
  if (crew.projectId) {
    return crew;
  }

  return {
    ...crew,
    projectId: demoProjectId ?? activeProjectId,
  };
};

const optionalText = (value: unknown) => (typeof value === 'string' && value.length > 0 ? value : undefined);

const projectIdForSource = (data: AppData, sourceEntityId: string | undefined) => {
  if (!sourceEntityId) {
    return undefined;
  }

  const directProject = data.projects.find((project) => project.id === sourceEntityId)?.id;
  if (directProject) return directProject;
  const building = data.buildings.find((item) => item.id === sourceEntityId);
  if (building) return building.projectId;
  const floor = data.floors.find((item) => item.id === sourceEntityId);
  if (floor) return data.buildings.find((item) => item.id === floor.buildingId)?.projectId;
  const crew = data.crewMembers.find((item) => item.id === sourceEntityId);
  if (crew?.projectId) return crew.projectId;

  return (
    data.units.find((item) => item.id === sourceEntityId)?.projectId ??
    data.assignments.find((item) => item.id === sourceEntityId)?.projectId ??
    data.issues.find((item) => item.id === sourceEntityId)?.projectId ??
    data.photoNotes.find((item) => item.id === sourceEntityId)?.projectId ??
    data.dailyLogs.find((item) => item.id === sourceEntityId)?.projectId ??
    data.reportDrafts.find((item) => item.id === sourceEntityId)?.projectId ??
    data.activityLogs.find((item) => item.id === sourceEntityId)?.projectId
  );
};

const normalizeMemory = (memory: Memory, data: AppData): Memory => {
  const sourceEntityId = optionalText(memory.sourceEntityId);
  return {
    ...memory,
    projectId: optionalText(memory.projectId) ?? projectIdForSource(data, sourceEntityId),
    sourceEntityId,
  };
};

const normalizeMemoryCandidate = (candidate: MemoryCandidate, data: AppData): MemoryCandidate => {
  const sourceEntityId = optionalText(candidate.sourceEntityId);
  return {
    ...candidate,
    projectId: optionalText(candidate.projectId) ?? projectIdForSource(data, sourceEntityId),
    sourceEntityId,
  };
};

export const normalizeAppData = (data: AppData): AppData => {
  const projects = arrayOrEmpty(data.projects).map(normalizeProject);
  const demoProject = projects.find((project) => project.mode === 'demo') ?? projects.find((project) => project.id === DEMO_PROJECT_ID);
  const activeProjectId = pickActiveProjectId(projects, data.activeProjectId);
  const buildings = arrayOrEmpty(data.buildings).map(normalizeBuilding);
  const floors = arrayOrEmpty(data.floors).map(normalizeFloor);
  const crewMembers = arrayOrEmpty(data.crewMembers).map((crew) => normalizeCrew(crew, demoProject?.id, activeProjectId));
  const scopeData = { ...data, projects, buildings, floors, crewMembers, activeProjectId };

  return applyActivityLogRetention({
    ...data,
    activeProjectId,
    projects,
    propertyContacts: arrayOrEmpty(data.propertyContacts),
    buildings,
    floors,
    units: arrayOrEmpty(data.units),
    crewMembers,
    assignments: arrayOrEmpty(data.assignments).map(normalizeAssignment),
    issues: arrayOrEmpty(data.issues),
    photoNotes: arrayOrEmpty(data.photoNotes).map(normalizePhotoNote),
    dailyLogs: arrayOrEmpty(data.dailyLogs),
    daySessions: arrayOrEmpty(data.daySessions),
    dailyReleaseBatches: arrayOrEmpty(data.dailyReleaseBatches),
    todayTasks: arrayOrEmpty(data.todayTasks),
    fieldEvents: arrayOrEmpty(data.fieldEvents),
    walkSessions: arrayOrEmpty(data.walkSessions),
    reportDrafts: arrayOrEmpty(data.reportDrafts).map(normalizeReportDraft),
    trainingQuestions: arrayOrEmpty(data.trainingQuestions),
    activityLogs: arrayOrEmpty(data.activityLogs),
    draftActions: arrayOrEmpty(data.draftActions),
    memories: arrayOrEmpty(data.memories).map((memory) => normalizeMemory(memory, scopeData)),
    memoryCandidates: arrayOrEmpty(data.memoryCandidates).map((candidate) => normalizeMemoryCandidate(candidate, scopeData)),
    agentRuns: arrayOrEmpty(data.agentRuns),
    aiUsageEvents: arrayOrEmpty(data.aiUsageEvents).map(normalizeAiUsageEvent),
    copilotConversations: arrayOrEmpty(data.copilotConversations),
    followUpTasks: arrayOrEmpty(data.followUpTasks),
    smartSuggestions: arrayOrEmpty(data.smartSuggestions),
    configurableStatuses: Array.isArray(data.configurableStatuses) ? data.configurableStatuses : UNIT_WORKFLOW_STATUSES,
  });
};
