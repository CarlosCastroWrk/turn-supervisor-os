import type { AppData, CrewMember, Project } from '../types';
import { UNIT_WORKFLOW_STATUSES } from './constants';

const DEMO_PROJECT_ID = 'project_west_campus_turn';

const arrayOrEmpty = <T>(value: T[] | undefined): T[] => (Array.isArray(value) ? value : []);

const normalizeProject = (project: Project): Project => ({
  ...project,
  mode: project.mode === 'real' ? 'real' : 'demo',
});

const pickActiveProjectId = (projects: Project[], currentActiveProjectId: string) => {
  if (projects.length === 0) {
    return currentActiveProjectId;
  }

  const activeProject = projects.find((project) => project.id === currentActiveProjectId);
  const realProjects = projects
    .filter((project) => project.mode === 'real')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  if (!activeProject) {
    return realProjects[0]?.id ?? projects[0].id;
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

export const normalizeAppData = (data: AppData): AppData => {
  const projects = arrayOrEmpty(data.projects).map(normalizeProject);
  const demoProject = projects.find((project) => project.mode === 'demo') ?? projects.find((project) => project.id === DEMO_PROJECT_ID);
  const activeProjectId = pickActiveProjectId(projects, data.activeProjectId);

  return {
    ...data,
    activeProjectId,
    projects,
    buildings: arrayOrEmpty(data.buildings),
    floors: arrayOrEmpty(data.floors),
    units: arrayOrEmpty(data.units),
    crewMembers: arrayOrEmpty(data.crewMembers).map((crew) => normalizeCrew(crew, demoProject?.id, activeProjectId)),
    assignments: arrayOrEmpty(data.assignments),
    issues: arrayOrEmpty(data.issues),
    photoNotes: arrayOrEmpty(data.photoNotes),
    dailyLogs: arrayOrEmpty(data.dailyLogs),
    trainingQuestions: arrayOrEmpty(data.trainingQuestions),
    activityLogs: arrayOrEmpty(data.activityLogs),
    draftActions: arrayOrEmpty(data.draftActions),
    memories: arrayOrEmpty(data.memories),
    memoryCandidates: arrayOrEmpty(data.memoryCandidates),
    agentRuns: arrayOrEmpty(data.agentRuns),
    copilotConversations: arrayOrEmpty(data.copilotConversations),
    followUpTasks: arrayOrEmpty(data.followUpTasks),
    smartSuggestions: arrayOrEmpty(data.smartSuggestions),
    configurableStatuses: Array.isArray(data.configurableStatuses) ? data.configurableStatuses : UNIT_WORKFLOW_STATUSES,
  };
};
