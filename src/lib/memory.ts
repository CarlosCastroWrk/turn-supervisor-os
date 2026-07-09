import type { AppData, Memory, MemoryCandidate, MemoryType } from '../types';

export const isExplicitGlobalMemory = (memory: Pick<Memory, 'projectId' | 'memoryType' | 'source'>) =>
  !memory.projectId &&
  (memory.memoryType === 'Personal Supervisor Preference' || memory.source === 'Built-in safety rule');

const memoryFingerprint = (item: Pick<MemoryCandidate, 'memoryType' | 'content'>) =>
  `${item.memoryType}:${item.content.trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '').toLowerCase()}`;

export const prepareMemoryCandidatesForActiveProject = (data: AppData, candidates: MemoryCandidate[]) => {
  const existing = new Set([
    ...data.memories
      .filter((memory) => memory.projectId === data.activeProjectId || isExplicitGlobalMemory(memory))
      .map(memoryFingerprint),
    ...data.memoryCandidates
      .filter((candidate) => candidate.projectId === data.activeProjectId && candidate.status === 'pending')
      .map(memoryFingerprint),
  ]);

  return candidates.reduce<MemoryCandidate[]>((next, candidate) => {
    const scopedCandidate = {
      ...candidate,
      projectId: data.activeProjectId,
      content: candidate.content.trim(),
    };
    const fingerprint = memoryFingerprint(scopedCandidate);
    if (!scopedCandidate.content || existing.has(fingerprint)) {
      return next;
    }
    existing.add(fingerprint);
    next.push(scopedCandidate);
    return next;
  }, []);
};

const sourceProjectId = (data: AppData, sourceEntityId: string) => {
  const project = data.projects.find((item) => item.id === sourceEntityId);
  if (project) return project.id;
  const building = data.buildings.find((item) => item.id === sourceEntityId);
  if (building) return building.projectId;
  const floor = data.floors.find((item) => item.id === sourceEntityId);
  if (floor) return data.buildings.find((item) => item.id === floor.buildingId)?.projectId;
  const crew = data.crewMembers.find((item) => item.id === sourceEntityId);
  if (crew) return crew.projectId;
  const memoryCandidate = data.memoryCandidates.find((item) => item.id === sourceEntityId);
  if (memoryCandidate) return memoryCandidate.projectId;

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

const sourceIsActive = (data: AppData, memory: Memory) => {
  if (!memory.sourceEntityId) {
    return true;
  }

  const crew = data.crewMembers.find((item) => item.id === memory.sourceEntityId);
  if (crew && !crew.active) {
    return false;
  }
  const memoryCandidate = data.memoryCandidates.find((item) => item.id === memory.sourceEntityId);
  if (memoryCandidate && memoryCandidate.status !== 'approved') {
    return false;
  }

  const projectId = sourceProjectId(data, memory.sourceEntityId);
  if (projectId) {
    const project = data.projects.find((item) => item.id === projectId);
    return Boolean(project && !project.archivedAt && (!memory.projectId || memory.projectId === projectId));
  }

  return (
    data.trainingQuestions.some((item) => item.id === memory.sourceEntityId) ||
    data.draftActions.some((item) => item.id === memory.sourceEntityId) ||
    data.followUpTasks.some((item) => item.id === memory.sourceEntityId) ||
    data.memoryCandidates.some((item) => item.id === memory.sourceEntityId)
  );
};

export const memoryAppliesToProject = (data: AppData, memory: Memory, projectId: string) => {
  if (!memory.approved || !sourceIsActive(data, memory)) {
    return false;
  }
  if (isExplicitGlobalMemory(memory)) {
    return true;
  }
  if (memory.projectId !== projectId) {
    return false;
  }

  const project = data.projects.find((item) => item.id === memory.projectId);
  return Boolean(project && !project.archivedAt);
};

export const memoryAppliesToActiveProject = (data: AppData, memory: Memory) =>
  memoryAppliesToProject(data, memory, data.activeProjectId);

export const getApplicableMemoriesForProject = (data: AppData, projectId: string, memoryTypes?: MemoryType[]) => {
  const allowedTypes = memoryTypes ? new Set(memoryTypes) : undefined;
  return data.memories.filter(
    (memory) => memoryAppliesToProject(data, memory, projectId) && (!allowedTypes || allowedTypes.has(memory.memoryType)),
  );
};

export const getApplicableMemories = (data: AppData, memoryTypes?: MemoryType[]) => {
  return getApplicableMemoriesForProject(data, data.activeProjectId, memoryTypes);
};

export const getActiveProjectMemoryCandidates = (data: AppData, status?: MemoryCandidate['status']) =>
  data.memoryCandidates.filter(
    (candidate) => candidate.projectId === data.activeProjectId && (!status || candidate.status === status),
  );

export const getUnscopedMemoryCandidates = (data: AppData) =>
  data.memoryCandidates.filter((candidate) => !candidate.projectId && candidate.status === 'pending');

export const getMemoriesForActiveProjectSettings = (data: AppData) =>
  data.memories.filter(
    (memory) => memory.projectId === data.activeProjectId || isExplicitGlobalMemory(memory) || !memory.projectId,
  );

export const memoryScopeLabel = (data: AppData, memory: Pick<Memory, 'projectId' | 'memoryType' | 'source'>) => {
  if (memory.projectId) {
    return data.projects.find((project) => project.id === memory.projectId)?.name ?? 'Unknown project';
  }
  return isExplicitGlobalMemory(memory) ? 'All Turns' : 'Needs project scope';
};
