import type {
  ActivityLog,
  AppData,
  Assignment,
  Building,
  CrewMember,
  DailyLog,
  DraftAction,
  EntityId,
  Floor,
  FollowUpTask,
  Issue,
  Memory,
  MemoryCandidate,
  PhotoNote,
  Project,
  TrainingQuestion,
  Unit,
  UnitWorkflowStatus,
  WorkStatus,
} from '../types';
import {
  ASSIGNMENT_STATUSES,
  CREW_TRADES,
  ISSUE_CATEGORIES,
  ISSUE_PRIORITIES,
  ISSUE_STATUSES,
  UNIT_WORKFLOW_STATUSES,
  WORK_STATUSES,
  createId,
  nowISO,
  todayISO,
} from './constants';
import { memoryAppliesToActiveProject, prepareMemoryCandidatesForActiveProject } from './memory';

export interface RealTurnSetupInput {
  projectName: string;
  propertyName: string;
  location: string;
  startDate: string;
  endDate: string;
  supervisorName: string;
  projectManagerName: string;
  buildingNames: string[];
  buildingCount: number;
  floorsPerBuilding: number;
  unitsPerFloor: number;
  firstUnitNumber: number;
  bedCount: number;
  bathroomCount: number;
  hasCommonArea: boolean;
  notes: string;
}

type ActivityEntity = ActivityLog['entityType'];

export type ReversibleUnitPatch = Partial<
  Pick<
    Unit,
    | 'overallStatus'
    | 'paintStatus'
    | 'cleanStatus'
    | 'repairStatus'
    | 'flooringStatus'
    | 'trashStatus'
    | 'inspectionStatus'
  >
>;

export interface UnitUpdateUndoToken {
  unitId: EntityId;
  unitNumber: string;
  expectedUpdatedAt: string;
  previousPatch: ReversibleUnitPatch;
  note: string;
}

export interface UnitUpdateWithUndoResult {
  data: AppData;
  status: 'applied' | 'unchanged' | 'missing';
  undoToken?: UnitUpdateUndoToken;
}

export interface UnitUndoResult {
  data: AppData;
  status: 'applied' | 'stale' | 'missing';
}

const nextEntityTimestamp = (previousUpdatedAt: string) => {
  const now = Date.now();
  const previous = Date.parse(previousUpdatedAt);
  return new Date(Number.isFinite(previous) ? Math.max(now, previous + 1) : now).toISOString();
};

const activity = (
  projectId: EntityId,
  entityType: ActivityEntity,
  entityId: EntityId,
  action: string,
  note: string,
): ActivityLog => ({
  id: createId('activity'),
  projectId,
  entityType,
  entityId,
  action,
  note,
  createdAt: nowISO(),
});

export const updateProject = (data: AppData, projectId: EntityId, patch: Partial<Project>): AppData => ({
  ...data,
  projects: data.projects.map((project) =>
    project.id === projectId ? { ...project, ...patch, updatedAt: nowISO() } : project,
  ),
  activityLogs: [
    activity(projectId, 'Project', projectId, 'Updated project setup', 'Project setup fields were updated.'),
    ...data.activityLogs,
  ],
});

const isArchivedProject = (project: Project) => Boolean(project.archivedAt);

const activeFallbackAfterArchive = (data: AppData, archivedProjectId: EntityId) => {
  const visibleProjects = data.projects.filter((project) => project.id !== archivedProjectId && !isArchivedProject(project));
  const realProjects = visibleProjects
    .filter((project) => project.mode === 'real')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const demoProject = visibleProjects.find((project) => project.mode === 'demo');

  return realProjects[0]?.id ?? demoProject?.id ?? visibleProjects[0]?.id ?? data.activeProjectId;
};

export const archiveProject = (data: AppData, projectId: EntityId): AppData => {
  const project = data.projects.find((item) => item.id === projectId);
  if (!project || project.mode !== 'real' || isArchivedProject(project)) {
    return data;
  }

  const archivedAt = nowISO();
  const activeProjectId = data.activeProjectId === projectId ? activeFallbackAfterArchive(data, projectId) : data.activeProjectId;

  return {
    ...data,
    activeProjectId,
    projects: data.projects.map((item) =>
      item.id === projectId ? { ...item, archivedAt, updatedAt: archivedAt } : item,
    ),
    activityLogs: [
      activity(projectId, 'Project', projectId, 'Archived Real Turn project', 'Project was hidden from normal project switching. Records were not deleted.'),
      ...data.activityLogs,
    ],
  };
};

export const restoreProject = (data: AppData, projectId: EntityId): AppData => {
  const project = data.projects.find((item) => item.id === projectId);
  if (!project || project.mode !== 'real' || !isArchivedProject(project)) {
    return data;
  }

  const updatedAt = nowISO();

  return {
    ...data,
    projects: data.projects.map((item) => {
      if (item.id !== projectId) {
        return item;
      }

      const restoredProject = { ...item };
      delete restoredProject.archivedAt;
      return { ...restoredProject, updatedAt };
    }),
    activityLogs: [
      activity(projectId, 'Project', projectId, 'Restored Real Turn project', 'Project is visible in normal project switching again.'),
      ...data.activityLogs,
    ],
  };
};

const buildingNameForIndex = (index: number) => `Building ${String.fromCharCode(65 + index)}`;

const unitNumberFor = (firstUnitNumber: number, floorNumber: number, unitIndex: number) => {
  const firstRoom = Number.isFinite(firstUnitNumber) && firstUnitNumber > 0 ? firstUnitNumber : 101;
  const roomStart = firstRoom % 100 || 1;
  return `${floorNumber}${String(roomStart + unitIndex).padStart(2, '0')}`;
};

export const switchActiveProject = (data: AppData, projectId: EntityId): AppData => {
  const project = data.projects.find((item) => item.id === projectId);
  if (!project || isArchivedProject(project)) {
    return data;
  }

  return {
    ...data,
    activeProjectId: projectId,
    activityLogs: [
      activity(projectId, 'Project', projectId, `Switched to ${project.mode === 'real' ? 'Real Turn' : 'Demo Mode'}`, project.name),
      ...data.activityLogs,
    ],
  };
};

export const createRealTurnProject = (data: AppData, input: RealTurnSetupInput): AppData => {
  const now = nowISO();
  const projectId = createId('project_real');
  const requestedNames = input.buildingNames.map((name) => name.trim()).filter(Boolean);
  const buildingTotal = Math.max(requestedNames.length, input.buildingCount, requestedNames.length > 0 ? requestedNames.length : 1);
  const floorTotal = Math.max(0, input.floorsPerBuilding);
  const unitTotal = Math.max(0, input.unitsPerFloor);

  const project: Project = {
    id: projectId,
    mode: 'real',
    name: input.projectName.trim() || `${input.propertyName.trim() || 'Real Turn'} Field Copilot`,
    propertyName: input.propertyName.trim(),
    location: input.location.trim(),
    startDate: input.startDate,
    endDate: input.endDate,
    supervisorName: input.supervisorName.trim() || 'Los',
    projectManagerName: input.projectManagerName.trim(),
    notes: input.notes.trim(),
    estimatedBuildings: buildingTotal,
    estimatedUnits: buildingTotal * floorTotal * unitTotal,
    estimatedBeds: buildingTotal * floorTotal * unitTotal * Math.max(0, input.bedCount),
    estimatedCommonAreas: input.hasCommonArea ? buildingTotal * floorTotal * unitTotal : 0,
    createdAt: now,
    updatedAt: now,
  };

  const buildings: Building[] = Array.from({ length: buildingTotal }, (_, index) => ({
    id: createId('building_real'),
    projectId,
    name: requestedNames[index] || buildingNameForIndex(index),
    notes: '',
    createdAt: now,
    updatedAt: now,
  }));

  const floors: Floor[] = buildings.flatMap((building) =>
    Array.from({ length: floorTotal }, (_, index) => ({
      id: createId('floor_real'),
      buildingId: building.id,
      name: `Floor ${index + 1}`,
      notes: '',
      createdAt: now,
      updatedAt: now,
    })),
  );

  const units = buildings.flatMap((building) => {
    const buildingFloors = floors.filter((floor) => floor.buildingId === building.id);
    return buildingFloors.flatMap((floor, floorIndex) =>
      Array.from({ length: unitTotal }, (_, unitIndex) => ({
        id: createId('unit_real'),
        projectId,
        buildingId: building.id,
        floorId: floor.id,
        unitNumber: unitNumberFor(input.firstUnitNumber, floorIndex + 1, unitIndex),
        bedCount: Math.max(0, input.bedCount),
        bathroomCount: Math.max(0, input.bathroomCount),
        hasCommonArea: input.hasCommonArea,
        overallStatus: 'Not Started' as const,
        paintStatus: 'Not Started' as const,
        cleanStatus: 'Not Started' as const,
        repairStatus: 'Not Started' as const,
        flooringStatus: 'Not Applicable' as const,
        trashStatus: 'Not Started' as const,
        inspectionStatus: 'Not Started' as const,
        assignedCrewIds: [],
        notes: '',
        createdAt: now,
        updatedAt: now,
      })),
    );
  });

  return {
    ...data,
    activeProjectId: projectId,
    projects: [project, ...data.projects],
    buildings: [...buildings, ...data.buildings],
    floors: [...floors, ...data.floors],
    units: [...units, ...data.units],
    activityLogs: [
      activity(
        projectId,
        'Project',
        projectId,
        'Started Real Turn Mode',
        `Created real project with ${buildings.length} building(s), ${floors.length} floor(s), and ${units.length} unit(s). Demo data was preserved separately.`,
      ),
      ...data.activityLogs,
    ],
  };
};

export const updateUnit = (data: AppData, unitId: EntityId, patch: Partial<Unit>, note: string): AppData => {
  const existing = data.units.find((unit) => unit.id === unitId);
  if (!existing) {
    return data;
  }

  const updatedAt = nextEntityTimestamp(existing.updatedAt);

  return {
    ...data,
    units: data.units.map((unit) => (unit.id === unitId ? { ...unit, ...patch, updatedAt } : unit)),
    activityLogs: [activity(existing.projectId, 'Unit', unitId, 'Updated unit', note), ...data.activityLogs],
  };
};

export const updateUnitWithUndo = (
  data: AppData,
  unitId: EntityId,
  patch: ReversibleUnitPatch,
  note: string,
): UnitUpdateWithUndoResult => {
  const existing = data.units.find((unit) => unit.id === unitId);
  if (!existing) {
    return { data, status: 'missing' };
  }

  const fields = Object.keys(patch) as (keyof ReversibleUnitPatch)[];
  if (fields.length === 0 || fields.every((field) => Object.is(existing[field], patch[field]))) {
    return { data, status: 'unchanged' };
  }
  const previousPatch = fields.reduce<ReversibleUnitPatch>((previous, field) => {
    Object.assign(previous, { [field]: existing[field] });
    return previous;
  }, {});
  const nextData = updateUnit(data, unitId, patch, note);
  const updatedUnit = nextData.units.find((unit) => unit.id === unitId);
  if (!updatedUnit) {
    return { data: nextData, status: 'missing' };
  }

  return {
    data: nextData,
    status: 'applied',
    undoToken: {
      unitId,
      unitNumber: existing.unitNumber,
      expectedUpdatedAt: updatedUnit.updatedAt,
      previousPatch,
      note,
    },
  };
};

export const undoUnitUpdate = (data: AppData, token: UnitUpdateUndoToken): UnitUndoResult => {
  const current = data.units.find((unit) => unit.id === token.unitId);
  if (!current) {
    return { data, status: 'missing' };
  }
  if (current.updatedAt !== token.expectedUpdatedAt) {
    return { data, status: 'stale' };
  }

  return {
    data: updateUnit(data, token.unitId, token.previousPatch, `Undo: ${token.note}`),
    status: 'applied',
  };
};

export const addUnits = (data: AppData, units: Unit[]): AppData => ({
  ...data,
  units: [...units, ...data.units],
  activityLogs: [
    activity(data.activeProjectId, 'Unit', units[0]?.id ?? data.activeProjectId, 'Created units', `Added ${units.length} unit(s).`),
    ...data.activityLogs,
  ],
});

export const addIssue = (data: AppData, issue: Issue): AppData => ({
  ...data,
  issues: [issue, ...data.issues],
  activityLogs: [activity(issue.projectId, 'Issue', issue.id, 'Created issue', issue.title), ...data.activityLogs],
});

export const blockingUnitStatusForIssue = (category: Issue['category']): UnitWorkflowStatus => {
  if (category === 'Access' || category === 'Keys') return 'Access Blocked';
  if (category === 'Maintenance') return 'Maintenance Needed';
  return 'Hold / Blocked';
};

export const addIssueWithOptionalUnitBlock = (data: AppData, issue: Issue, blocksUnit: boolean): AppData => {
  const withIssue = addIssue(data, issue);

  if (!blocksUnit || !issue.unitId) {
    return withIssue;
  }

  return updateUnit(
    withIssue,
    issue.unitId,
    { overallStatus: blockingUnitStatusForIssue(issue.category) },
    `Blocking issue created: ${issue.title}`,
  );
};

export const updateIssue = (data: AppData, issueId: EntityId, patch: Partial<Issue>): AppData => {
  const existing = data.issues.find((issue) => issue.id === issueId);
  if (!existing) {
    return data;
  }

  return {
    ...data,
    issues: data.issues.map((issue) => (issue.id === issueId ? { ...issue, ...patch, updatedAt: nowISO() } : issue)),
    activityLogs: [activity(existing.projectId, 'Issue', issueId, 'Updated issue', patch.status ?? existing.status), ...data.activityLogs],
  };
};

export const resolveIssue = (data: AppData, issueId: EntityId): AppData => {
  const existing = data.issues.find((issue) => issue.id === issueId);
  if (!existing) {
    return data;
  }

  return updateIssue(data, issueId, {
    status: 'Resolved',
    resolutionNotes: existing.resolutionNotes.trim() || 'Resolved from issue board.',
  });
};

export const closeIssueFromBoard = (data: AppData, issueId: EntityId): AppData => {
  const existing = data.issues.find((issue) => issue.id === issueId);
  if (!existing) {
    return data;
  }

  return updateIssue(data, issueId, {
    status: 'Closed',
    resolutionNotes: existing.resolutionNotes.trim() || 'Removed from normal issue board.',
  });
};

export const addCrewMember = (data: AppData, crew: CrewMember): AppData => ({
  ...data,
  crewMembers: [crew, ...data.crewMembers],
  activityLogs: [activity(data.activeProjectId, 'CrewMember', crew.id, 'Added crew contact', crew.name), ...data.activityLogs],
});

export const updateCrewMember = (data: AppData, crewId: EntityId, patch: Partial<CrewMember>): AppData => ({
  ...data,
  crewMembers: data.crewMembers.map((crew) => (crew.id === crewId ? { ...crew, ...patch, updatedAt: nowISO() } : crew)),
  activityLogs: [activity(data.activeProjectId, 'CrewMember', crewId, 'Updated crew contact', patch.notes ?? ''), ...data.activityLogs],
});

export const addAssignment = (data: AppData, assignment: Assignment): AppData => ({
  ...data,
  assignments: [{ ...assignment, createdAt: assignment.createdAt || nowISO(), updatedAt: assignment.updatedAt || nowISO() }, ...data.assignments],
  activityLogs: [activity(assignment.projectId, 'Assignment', assignment.id, 'Created assignment', assignment.scope), ...data.activityLogs],
});

export const updateAssignment = (data: AppData, assignmentId: EntityId, patch: Partial<Assignment>): AppData => {
  const existing = data.assignments.find((assignment) => assignment.id === assignmentId);
  if (!existing) {
    return data;
  }

  return {
    ...data,
    assignments: data.assignments.map((assignment) =>
      assignment.id === assignmentId ? { ...assignment, ...patch, updatedAt: nowISO() } : assignment,
    ),
    activityLogs: [
      activity(existing.projectId, 'Assignment', assignmentId, 'Updated assignment', patch.status ?? existing.status),
      ...data.activityLogs,
    ],
  };
};

export const upsertDailyLog = (data: AppData, dailyLog: DailyLog): AppData => {
  const exists = data.dailyLogs.some((log) => log.id === dailyLog.id);
  return {
    ...data,
    dailyLogs: exists
      ? data.dailyLogs.map((log) => (log.id === dailyLog.id ? { ...dailyLog, updatedAt: nowISO() } : log))
      : [{ ...dailyLog, createdAt: nowISO(), updatedAt: nowISO() }, ...data.dailyLogs],
    activityLogs: [activity(dailyLog.projectId, 'DailyLog', dailyLog.id, 'Saved daily log', dailyLog.date), ...data.activityLogs],
  };
};

export const updateTrainingQuestion = (data: AppData, questionId: EntityId, patch: Partial<TrainingQuestion>): AppData => ({
  ...data,
  trainingQuestions: data.trainingQuestions.map((question) =>
    question.id === questionId ? { ...question, ...patch, updatedAt: nowISO() } : question,
  ),
  activityLogs: [
    activity(data.activeProjectId, 'TrainingQuestion', questionId, 'Updated training question', patch.status ?? ''),
    ...data.activityLogs,
  ],
});

export const addPhotoNote = (data: AppData, photo: PhotoNote): AppData => ({
  ...data,
  photoNotes: [{ ...photo, createdAt: photo.createdAt || nowISO(), updatedAt: photo.updatedAt || photo.createdAt || nowISO() }, ...data.photoNotes],
  activityLogs: [
    activity(photo.projectId, 'PhotoNote', photo.id, 'Added photo/note', photo.caption || photo.category),
    ...data.activityLogs,
  ],
});

export const addDraftActions = (data: AppData, draftActions: DraftAction[], sourceNote: string, batchId = createId('capture_batch')): AppData => {
  const captureCreatedAt = nowISO();
  const batchedDraftActions = draftActions.map((draft) => ({
    ...draft,
    payload: {
      ...draft.payload,
      captureBatchId: typeof draft.payload.captureBatchId === 'string' ? draft.payload.captureBatchId : batchId,
      captureCreatedAt,
      captureSourceNote: sourceNote,
    },
  }));

  return {
    ...data,
    draftActions: [...batchedDraftActions, ...data.draftActions],
    activityLogs:
      batchedDraftActions.length > 0
        ? [
            activity(
              data.activeProjectId,
              'DraftAction',
              batchedDraftActions[0].id,
              'Created draft actions',
              `${batchedDraftActions.length} draft action(s) from Quick Capture: ${sourceNote.slice(0, 120)}`,
            ),
            ...data.activityLogs,
          ]
        : data.activityLogs,
  };
};

export const updateDraftAction = (data: AppData, draftActionId: EntityId, patch: Partial<DraftAction>): AppData => ({
  ...data,
  draftActions: data.draftActions.map((draft) => (draft.id === draftActionId ? { ...draft, ...patch } : draft)),
});

export const rejectDraftAction = (data: AppData, draftActionId: EntityId): AppData =>
  updateDraftAction(data, draftActionId, { status: 'rejected' });

export const addMemoryCandidates = (data: AppData, candidates: MemoryCandidate[]): AppData => {
  const scopedCandidates = prepareMemoryCandidatesForActiveProject(data, candidates);

  if (scopedCandidates.length === 0) {
    return data;
  }

  return {
    ...data,
    memoryCandidates: [...scopedCandidates, ...data.memoryCandidates],
    activityLogs:
      scopedCandidates.length > 0
        ? [
            activity(
              scopedCandidates[0].projectId ?? data.activeProjectId,
              'Memory',
              scopedCandidates[0].id,
              'Created memory candidates',
              `${scopedCandidates.length} memory candidate(s) require review.`,
            ),
            ...data.activityLogs,
          ]
        : data.activityLogs,
  };
};

export const approveMemoryCandidate = (data: AppData, candidateId: EntityId): AppData => {
  const candidate = data.memoryCandidates.find((item) => item.id === candidateId);
  const project = data.projects.find((item) => item.id === candidate?.projectId);
  if (
    !candidate ||
    candidate.status !== 'pending' ||
    !candidate.content.trim() ||
    !candidate.projectId ||
    candidate.projectId !== data.activeProjectId ||
    !project ||
    project.archivedAt
  ) {
    return data;
  }

  const now = nowISO();
  const memory: Memory = {
    id: createId('memory'),
    projectId: candidate.projectId,
    memoryType: candidate.memoryType,
    content: candidate.content,
    source: candidate.source,
    sourceEntityId: candidate.sourceEntityId,
    confidence: candidate.confidence,
    approved: true,
    createdAt: now,
    updatedAt: now,
  };

  return {
    ...data,
    memories: [memory, ...data.memories],
    memoryCandidates: data.memoryCandidates.map((item) =>
      item.id === candidateId ? { ...item, status: 'approved', updatedAt: now } : item,
    ),
    activityLogs: [activity(candidate.projectId, 'Memory', memory.id, 'Approved memory', memory.content), ...data.activityLogs],
  };
};

export const rejectMemoryCandidate = (data: AppData, candidateId: EntityId): AppData => {
  const candidate = data.memoryCandidates.find((item) => item.id === candidateId);
  if (
    !candidate ||
    candidate.status !== 'pending' ||
    (candidate.projectId && candidate.projectId !== data.activeProjectId)
  ) {
    return data;
  }

  return {
    ...data,
    memoryCandidates: data.memoryCandidates.map((item) =>
      item.id === candidateId ? { ...item, status: 'rejected', updatedAt: nowISO() } : item,
    ),
  };
};

export const updateMemoryCandidate = (data: AppData, candidateId: EntityId, patch: Partial<MemoryCandidate>): AppData => ({
  ...data,
  memoryCandidates: data.memoryCandidates.map((candidate) =>
    candidate.id === candidateId ? { ...candidate, ...patch, updatedAt: nowISO() } : candidate,
  ),
});

export const updateMemory = (data: AppData, memoryId: EntityId, patch: Partial<Memory>): AppData => ({
  ...data,
  memories: data.memories.map((memory) => (memory.id === memoryId ? { ...memory, ...patch, updatedAt: nowISO() } : memory)),
});

export const markMemoriesUsed = (data: AppData, memoryIds: EntityId[]): AppData => {
  if (memoryIds.length === 0) {
    return data;
  }

  const requestedIds = new Set(memoryIds);
  const ids = new Set(
    data.memories
      .filter((memory) => requestedIds.has(memory.id) && memoryAppliesToActiveProject(data, memory))
      .map((memory) => memory.id),
  );
  if (ids.size === 0) {
    return data;
  }
  const now = nowISO();
  return {
    ...data,
    memories: data.memories.map((memory) =>
      ids.has(memory.id) ? { ...memory, lastUsedAt: now, updatedAt: now } : memory,
    ),
  };
};

export const addAgentRun = (data: AppData, mode: AppData['agentRuns'][number]['mode'], input: string, output: unknown): AppData => ({
  ...data,
  agentRuns: [
    {
      id: createId('agent_run'),
      mode,
      input,
      output,
      status: 'success',
      createdAt: nowISO(),
    },
    ...data.agentRuns,
  ],
});

export const addCopilotConversation = (
  data: AppData,
  question: string,
  answer: string,
  supportingRecords: string[],
  suggestedNextActions: string[],
): AppData => ({
  ...data,
  copilotConversations: [
    {
      id: createId('conversation_user'),
      role: 'user',
      content: question,
      supportingRecords: [],
      suggestedNextActions: [],
      createdAt: nowISO(),
    },
    {
      id: createId('conversation_assistant'),
      role: 'assistant',
      content: answer,
      supportingRecords,
      suggestedNextActions,
      createdAt: nowISO(),
    },
    ...data.copilotConversations,
  ],
});

const payloadString = (payload: Record<string, unknown>, key: string) => {
  const value = payload[key];
  return typeof value === 'string' ? value : '';
};

const payloadStringArray = (payload: Record<string, unknown>, key: string) => {
  const value = payload[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
};

type PayloadEnumResult<T extends string> = {
  error?: string;
  value?: T;
};

type RequiredPayloadEnumResult<T extends string> = {
  error?: string;
  value: T;
};

const payloadEnum = <T extends string>(payload: Record<string, unknown>, key: string, allowed: readonly T[]): PayloadEnumResult<T> => {
  const value = payloadString(payload, key);
  if (!value) {
    return { value: undefined };
  }

  if ((allowed as readonly string[]).includes(value)) {
    return { value: value as T };
  }

  return { error: `Invalid ${key}: ${value}.` };
};

const payloadEnumOrDefault = <T extends string>(
  payload: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  fallback: T,
): RequiredPayloadEnumResult<T> => {
  const result = payloadEnum(payload, key, allowed);
  return { error: result.error, value: result.value ?? fallback };
};

const findDraftUnit = (data: AppData, draft: DraftAction) => {
  const unitNumber = payloadString(draft.payload, 'unitNumber');
  const activeProjectUnits = data.units.filter((unit) => unit.projectId === data.activeProjectId);
  if (draft.targetEntityId) {
    return activeProjectUnits.find((unit) => unit.id === draft.targetEntityId);
  }

  return activeProjectUnits.find((unit) => unitNumber && unit.unitNumber === unitNumber);
};

const workDone = (status: Unit['paintStatus']) => status === 'Complete' || status === 'Not Applicable';

export const unitTradesComplete = (unit: Unit) =>
  workDone(unit.paintStatus) && workDone(unit.cleanStatus) && workDone(unit.repairStatus);

const tradeCompletionProtectedStatuses = new Set<UnitWorkflowStatus>([
  'Access Blocked',
  'Trash Out Needed',
  'Maintenance Needed',
  'Maintenance In Progress',
  'Punch List',
  'Inspection Needed',
  'Ready',
  'Rework Needed',
  'Hold / Blocked',
]);

const paintCompletionProtectedStatuses = new Set<UnitWorkflowStatus>([
  ...tradeCompletionProtectedStatuses,
  'Cleaning',
  'Cleaning Complete',
]);

const maintenanceProtectedStatuses = new Set<UnitWorkflowStatus>([
  'Access Blocked',
  'Trash Out Needed',
  'Maintenance In Progress',
  'Punch List',
  'Rework Needed',
  'Hold / Blocked',
]);

const activeTradeBlocker = (status: WorkStatus) =>
  status === 'Needed' || status === 'Blocked' || status === 'Rework Needed' || status === 'In Progress';

export const paintCompletionPatch = (unit: Unit): ReversibleUnitPatch => {
  const patch: ReversibleUnitPatch = { paintStatus: 'Complete' };
  if (
    paintCompletionProtectedStatuses.has(unit.overallStatus) ||
    activeTradeBlocker(unit.cleanStatus) ||
    activeTradeBlocker(unit.repairStatus) ||
    activeTradeBlocker(unit.trashStatus)
  ) {
    return patch;
  }

  const next = { ...unit, paintStatus: 'Complete' as const };
  return unitTradesComplete(next)
    ? { ...patch, overallStatus: 'Inspection Needed', inspectionStatus: 'Ready' }
    : { ...patch, overallStatus: 'Cleaning Ready' };
};

export const cleanCompletionPatch = (unit: Unit): ReversibleUnitPatch => {
  const patch: ReversibleUnitPatch = { cleanStatus: 'Complete' };
  if (tradeCompletionProtectedStatuses.has(unit.overallStatus)) {
    return patch;
  }

  return unitTradesComplete({ ...unit, cleanStatus: 'Complete' })
    ? { ...patch, overallStatus: 'Inspection Needed', inspectionStatus: 'Ready' }
    : patch;
};

export const maintenanceNeededPatch = (unit: Unit): ReversibleUnitPatch => ({
  repairStatus: 'Needed',
  ...(maintenanceProtectedStatuses.has(unit.overallStatus) ? {} : { overallStatus: 'Maintenance Needed' }),
});

const unitCanBeReady = (unit: Unit, patch: Partial<Unit>) => {
  const next = { ...unit, ...patch };
  return unitTradesComplete(next) && workDone(next.inspectionStatus);
};

const failDraft = (data: AppData, draft: DraftAction, error: string): AppData =>
  updateDraftAction(data, draft.id, {
    status: 'failed',
    error,
  });

const markDraftApplied = (data: AppData, draft: DraftAction): AppData =>
  updateDraftAction(data, draft.id, {
    status: 'applied',
    appliedAt: nowISO(),
    error: undefined,
  });

const appendText = (current: string, addition: string) => [current, addition].filter(Boolean).join(current ? '\n' : '');

export const applyDraftAction = (data: AppData, draftActionId: EntityId): AppData => {
  const draft = data.draftActions.find((item) => item.id === draftActionId);
  if (!draft || !['pending', 'approved', 'failed'].includes(draft.status)) {
    return data;
  }

  let next: AppData = updateDraftAction(data, draft.id, { status: 'approved', error: undefined });

  if (draft.payload.requiresConflictConfirmation === true && draft.payload.explicitConflictConfirmation !== true) {
    return failDraft(
      next,
      draft,
      'This draft conflicts with another draft from the same capture. Confirm it before approving.',
    );
  }

  if (draft.type === 'UPDATE_UNIT_STATUS') {
    const unit = findDraftUnit(next, draft);
    if (!unit) {
      return failDraft(next, draft, 'Unit not found. Confirm setup before applying this update.');
    }

    const patch: Partial<Unit> = {};
    const overallStatus = payloadEnum(draft.payload, 'overallStatus', UNIT_WORKFLOW_STATUSES);
    const paintStatus = payloadEnum(draft.payload, 'paintStatus', WORK_STATUSES);
    const cleanStatus = payloadEnum(draft.payload, 'cleanStatus', WORK_STATUSES);
    const repairStatus = payloadEnum(draft.payload, 'repairStatus', WORK_STATUSES);
    const inspectionStatus = payloadEnum(draft.payload, 'inspectionStatus', WORK_STATUSES);
    const invalidStatus = [overallStatus, paintStatus, cleanStatus, repairStatus, inspectionStatus].find((result) => result.error);
    if (invalidStatus?.error) {
      return failDraft(next, draft, invalidStatus.error);
    }

    if (overallStatus.value) patch.overallStatus = overallStatus.value as UnitWorkflowStatus;
    if (paintStatus.value) patch.paintStatus = paintStatus.value as WorkStatus;
    if (cleanStatus.value) patch.cleanStatus = cleanStatus.value as WorkStatus;
    if (repairStatus.value) patch.repairStatus = repairStatus.value as WorkStatus;
    if (inspectionStatus.value) patch.inspectionStatus = inspectionStatus.value as WorkStatus;

    if (patch.overallStatus === 'Ready' && !unitCanBeReady(unit, patch) && draft.payload.explicitReadyConfirmation !== true) {
      return failDraft(next, draft, 'Ready is blocked until paint, clean, maintenance, and inspection are complete.');
    }

    next = updateUnit(next, unit.id, patch, draft.summary);
    return markDraftApplied(next, draft);
  }

  if (draft.type === 'CREATE_ISSUE') {
    const unit = findDraftUnit(next, draft);
    const unitNumber = payloadString(draft.payload, 'unitNumber');
    if (unitNumber && !unit) {
      return failDraft(next, draft, `Unit ${unitNumber} is not in setup. Create or confirm the unit first.`);
    }

    const category = payloadEnumOrDefault(draft.payload, 'category', ISSUE_CATEGORIES, 'Other');
    const priority = payloadEnumOrDefault(draft.payload, 'priority', ISSUE_PRIORITIES, 'Medium');
    const status = payloadEnumOrDefault(draft.payload, 'status', ISSUE_STATUSES, 'Open');
    const invalidIssueValue = [category, priority, status].find((result) => result.error);
    if (invalidIssueValue?.error) {
      return failDraft(next, draft, invalidIssueValue.error);
    }

    const now = nowISO();
    next = addIssue(next, {
      id: createId('issue'),
      projectId: next.activeProjectId,
      buildingId: unit?.buildingId,
      floorId: unit?.floorId,
      unitId: unit?.id,
      title: payloadString(draft.payload, 'title') || draft.title,
      category: category.value,
      priority: priority.value,
      owner: payloadString(draft.payload, 'owner') || '',
      status: status.value,
      dueAt: payloadString(draft.payload, 'dueAt'),
      notes: payloadString(draft.payload, 'notes') || draft.sourceText,
      resolutionNotes: '',
      createdAt: now,
      updatedAt: now,
    });
    return markDraftApplied(next, draft);
  }

  if (draft.type === 'CREATE_ASSIGNMENT') {
    const unitNumbers = payloadStringArray(draft.payload, 'unitNumbers');
    const linkedUnits = next.units.filter((unit) => unit.projectId === next.activeProjectId && unitNumbers.includes(unit.unitNumber));
    const trade = payloadEnumOrDefault(draft.payload, 'trade', CREW_TRADES, 'Other');
    const status = payloadEnumOrDefault(draft.payload, 'status', ASSIGNMENT_STATUSES, 'In Progress');
    const invalidAssignmentValue = [trade, status].find((result) => result.error);
    if (invalidAssignmentValue?.error) {
      return failDraft(next, draft, invalidAssignmentValue.error);
    }

    const now = todayISO();
    const assignment: Assignment = {
      id: createId('assignment'),
      projectId: next.activeProjectId,
      teamName: payloadString(draft.payload, 'teamName') || 'Crew update',
      trade: trade.value,
      buildingId: linkedUnits[0]?.buildingId,
      floorId: linkedUnits[0]?.floorId,
      unitIds: linkedUnits.map((unit) => unit.id),
      scope: payloadString(draft.payload, 'scope') || draft.summary,
      date: payloadString(draft.payload, 'date') || now,
      startTime: payloadString(draft.payload, 'startTime'),
      expectedCompletion: '',
      actualCompletion: payloadString(draft.payload, 'status') === 'Complete' ? new Date().toTimeString().slice(0, 5) : '',
      status: status.value,
      notes: draft.sourceText,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    next = addAssignment(next, assignment);
    return markDraftApplied(next, draft);
  }

  if (draft.type === 'ADD_UNIT_NOTE') {
    const unit = findDraftUnit(next, draft);
    if (!unit) {
      return failDraft(next, draft, 'Unit not found. Confirm setup before adding this note.');
    }

    next = updateUnit(next, unit.id, { notes: appendText(unit.notes, payloadString(draft.payload, 'note') || draft.summary) }, draft.summary);
    return markDraftApplied(next, draft);
  }

  if (draft.type === 'ADD_DAILY_LOG_ENTRY') {
    const date = payloadString(draft.payload, 'date') || todayISO();
    const section = payloadString(draft.payload, 'section') || 'middayUpdate';
    const text = payloadString(draft.payload, 'text') || draft.summary;
    const existing =
      next.dailyLogs.find((log) => log.projectId === next.activeProjectId && log.date === date) ??
      ({
        id: createId('daily'),
        projectId: next.activeProjectId,
        date,
        morningPlan: '',
        middayUpdate: '',
        endOfDayReflection: '',
        completedSummary: '',
        blockers: '',
        lessons: '',
        tomorrowPriorities: '',
        createdAt: nowISO(),
        updatedAt: nowISO(),
      } satisfies DailyLog);

    const patch = { ...existing };
    if (section in patch && typeof patch[section as keyof DailyLog] === 'string') {
      (patch as unknown as Record<string, string>)[section] = appendText(String(patch[section as keyof DailyLog] ?? ''), text);
    } else {
      patch.middayUpdate = appendText(patch.middayUpdate, text);
    }

    next = upsertDailyLog(next, patch);
    return markDraftApplied(next, draft);
  }

  if (draft.type === 'CREATE_FOLLOW_UP_TASK') {
    const task: FollowUpTask = {
      id: createId('follow_up'),
      title: payloadString(draft.payload, 'title') || draft.title,
      description: payloadString(draft.payload, 'description') || draft.summary,
      priority: (payloadString(draft.payload, 'priority') || 'Medium') as FollowUpTask['priority'],
      dueAt: payloadString(draft.payload, 'dueAt'),
      owner: payloadString(draft.payload, 'owner') || 'Los',
      relatedEntityType: (payloadString(draft.payload, 'relatedEntityType') || draft.targetEntityType) as FollowUpTask['relatedEntityType'],
      relatedEntityId: draft.targetEntityId,
      status: 'open',
      createdAt: nowISO(),
    };
    next = {
      ...next,
      followUpTasks: [task, ...next.followUpTasks],
      activityLogs: [activity(next.activeProjectId, 'FollowUpTask', task.id, 'Created follow-up task', task.title), ...next.activityLogs],
    };
    return markDraftApplied(next, draft);
  }

  if (draft.type === 'CREATE_MEMORY_CANDIDATE') {
    next = addMemoryCandidates(next, [
      {
        id: createId('memory_candidate'),
        projectId: next.activeProjectId,
        memoryType: (payloadString(draft.payload, 'memoryType') || 'Lesson Learned') as MemoryCandidate['memoryType'],
        content: payloadString(draft.payload, 'content') || draft.summary,
        source: draft.sourceText,
        confidence: draft.confidence,
        status: 'pending',
        createdAt: nowISO(),
        updatedAt: nowISO(),
      },
    ]);
    return markDraftApplied(next, draft);
  }

  return failDraft(next, draft, 'This draft action type is not implemented yet.');
};

const pendingDraftsForAction = (data: AppData, draftIds?: EntityId[]) => {
  const allowedIds = draftIds ? new Set(draftIds) : undefined;
  return data.draftActions.filter((draft) => draft.status === 'pending' && (!allowedIds || allowedIds.has(draft.id)));
};

export const applyAllPendingDraftActions = (data: AppData, draftIds?: EntityId[]): AppData =>
  pendingDraftsForAction(data, draftIds)
    .reduce((current, draft) => applyDraftAction(current, draft.id), data);

export const rejectAllPendingDraftActions = (data: AppData, draftIds?: EntityId[]): AppData => {
  const allowedIds = draftIds ? new Set(draftIds) : undefined;
  return {
    ...data,
    draftActions: data.draftActions.map((draft) =>
      draft.status === 'pending' && (!allowedIds || allowedIds.has(draft.id)) ? { ...draft, status: 'rejected' } : draft,
    ),
  };
};
