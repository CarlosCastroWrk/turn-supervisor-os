import type { AppData, Assignment, Building, CrewMember, Floor, PhotoNote, Project } from '../types';
import { UNIT_WORKFLOW_STATUSES } from './constants';

const DEMO_PROJECT_ID = 'project_west_campus_turn';

const arrayOrEmpty = <T>(value: T[] | undefined): T[] => (Array.isArray(value) ? value : []);

const normalizeProject = (project: Project): Project => ({
  ...project,
  mode: project.mode === 'real' ? 'real' : 'demo',
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

export const normalizeAppData = (data: AppData): AppData => {
  const projects = arrayOrEmpty(data.projects).map(normalizeProject);
  const demoProject = projects.find((project) => project.mode === 'demo') ?? projects.find((project) => project.id === DEMO_PROJECT_ID);
  const activeProjectId = pickActiveProjectId(projects, data.activeProjectId);

  return {
    ...data,
    activeProjectId,
    projects,
    buildings: arrayOrEmpty(data.buildings).map(normalizeBuilding),
    floors: arrayOrEmpty(data.floors).map(normalizeFloor),
    units: arrayOrEmpty(data.units),
    crewMembers: arrayOrEmpty(data.crewMembers).map((crew) => normalizeCrew(crew, demoProject?.id, activeProjectId)),
    assignments: arrayOrEmpty(data.assignments).map(normalizeAssignment),
    issues: arrayOrEmpty(data.issues),
    photoNotes: arrayOrEmpty(data.photoNotes).map(normalizePhotoNote),
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
