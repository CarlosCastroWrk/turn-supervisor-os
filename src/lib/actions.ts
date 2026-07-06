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
import { createId, nowISO, todayISO } from './constants';

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

const buildingNameForIndex = (index: number) => `Building ${String.fromCharCode(65 + index)}`;

const unitNumberFor = (firstUnitNumber: number, floorNumber: number, unitIndex: number) => {
  const firstRoom = Number.isFinite(firstUnitNumber) && firstUnitNumber > 0 ? firstUnitNumber : 101;
  const roomStart = firstRoom % 100 || 1;
  return `${floorNumber}${String(roomStart + unitIndex).padStart(2, '0')}`;
};

export const switchActiveProject = (data: AppData, projectId: EntityId): AppData => {
  const project = data.projects.find((item) => item.id === projectId);
  if (!project) {
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

  return {
    ...data,
    units: data.units.map((unit) => (unit.id === unitId ? { ...unit, ...patch, updatedAt: nowISO() } : unit)),
    activityLogs: [activity(existing.projectId, 'Unit', unitId, 'Updated unit', note), ...data.activityLogs],
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

export const addDraftActions = (data: AppData, draftActions: DraftAction[], sourceNote: string): AppData => ({
  ...data,
  draftActions: [...draftActions, ...data.draftActions],
  activityLogs:
    draftActions.length > 0
      ? [
          activity(
            data.activeProjectId,
            'DraftAction',
            draftActions[0].id,
            'Created draft actions',
            `${draftActions.length} draft action(s) from Quick Capture: ${sourceNote.slice(0, 120)}`,
          ),
          ...data.activityLogs,
        ]
      : data.activityLogs,
});

export const updateDraftAction = (data: AppData, draftActionId: EntityId, patch: Partial<DraftAction>): AppData => ({
  ...data,
  draftActions: data.draftActions.map((draft) => (draft.id === draftActionId ? { ...draft, ...patch } : draft)),
});

export const rejectDraftAction = (data: AppData, draftActionId: EntityId): AppData =>
  updateDraftAction(data, draftActionId, { status: 'rejected' });

export const addMemoryCandidates = (data: AppData, candidates: MemoryCandidate[]): AppData => ({
  ...data,
  memoryCandidates: [...candidates, ...data.memoryCandidates],
  activityLogs:
    candidates.length > 0
      ? [
          activity(
            data.activeProjectId,
            'Memory',
            candidates[0].id,
            'Created memory candidates',
            `${candidates.length} memory candidate(s) require review.`,
          ),
          ...data.activityLogs,
        ]
      : data.activityLogs,
});

export const approveMemoryCandidate = (data: AppData, candidateId: EntityId): AppData => {
  const candidate = data.memoryCandidates.find((item) => item.id === candidateId);
  if (!candidate) {
    return data;
  }

  const now = nowISO();
  const memory: Memory = {
    id: createId('memory'),
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
    activityLogs: [activity(data.activeProjectId, 'Memory', memory.id, 'Approved memory', memory.content), ...data.activityLogs],
  };
};

export const rejectMemoryCandidate = (data: AppData, candidateId: EntityId): AppData => ({
  ...data,
  memoryCandidates: data.memoryCandidates.map((candidate) =>
    candidate.id === candidateId ? { ...candidate, status: 'rejected', updatedAt: nowISO() } : candidate,
  ),
});

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

const findDraftUnit = (data: AppData, draft: DraftAction) => {
  const unitNumber = payloadString(draft.payload, 'unitNumber');
  return data.units.find((unit) => unit.id === draft.targetEntityId || (unitNumber && unit.unitNumber === unitNumber));
};

const workDone = (status: Unit['paintStatus']) => status === 'Complete' || status === 'Not Applicable';

export const unitTradesComplete = (unit: Unit) =>
  workDone(unit.paintStatus) && workDone(unit.cleanStatus) && workDone(unit.repairStatus);

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

  if (draft.type === 'UPDATE_UNIT_STATUS') {
    const unit = findDraftUnit(next, draft);
    if (!unit) {
      return failDraft(next, draft, 'Unit not found. Confirm setup before applying this update.');
    }

    const patch: Partial<Unit> = {};
    const overallStatus = payloadString(draft.payload, 'overallStatus');
    const paintStatus = payloadString(draft.payload, 'paintStatus');
    const cleanStatus = payloadString(draft.payload, 'cleanStatus');
    const repairStatus = payloadString(draft.payload, 'repairStatus');
    const inspectionStatus = payloadString(draft.payload, 'inspectionStatus');

    if (overallStatus) patch.overallStatus = overallStatus as UnitWorkflowStatus;
    if (paintStatus) patch.paintStatus = paintStatus as WorkStatus;
    if (cleanStatus) patch.cleanStatus = cleanStatus as WorkStatus;
    if (repairStatus) patch.repairStatus = repairStatus as WorkStatus;
    if (inspectionStatus) patch.inspectionStatus = inspectionStatus as WorkStatus;

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

    const now = nowISO();
    next = addIssue(next, {
      id: createId('issue'),
      projectId: next.activeProjectId,
      buildingId: unit?.buildingId,
      floorId: unit?.floorId,
      unitId: unit?.id,
      title: payloadString(draft.payload, 'title') || draft.title,
      category: (payloadString(draft.payload, 'category') || 'Other') as Issue['category'],
      priority: (payloadString(draft.payload, 'priority') || 'Medium') as Issue['priority'],
      owner: payloadString(draft.payload, 'owner') || '',
      status: (payloadString(draft.payload, 'status') || 'Open') as Issue['status'],
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
    const linkedUnits = next.units.filter((unit) => unitNumbers.includes(unit.unitNumber));
    const now = todayISO();
    const assignment: Assignment = {
      id: createId('assignment'),
      projectId: next.activeProjectId,
      teamName: payloadString(draft.payload, 'teamName') || 'Crew update',
      trade: (payloadString(draft.payload, 'trade') || 'Other') as Assignment['trade'],
      buildingId: linkedUnits[0]?.buildingId,
      floorId: linkedUnits[0]?.floorId,
      unitIds: linkedUnits.map((unit) => unit.id),
      scope: payloadString(draft.payload, 'scope') || draft.summary,
      date: payloadString(draft.payload, 'date') || now,
      startTime: payloadString(draft.payload, 'startTime'),
      expectedCompletion: '',
      actualCompletion: payloadString(draft.payload, 'status') === 'Complete' ? new Date().toTimeString().slice(0, 5) : '',
      status: (payloadString(draft.payload, 'status') || 'In Progress') as Assignment['status'],
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

export const applyAllPendingDraftActions = (data: AppData): AppData =>
  data.draftActions
    .filter((draft) => draft.status === 'pending')
    .reduce((current, draft) => applyDraftAction(current, draft.id), data);

export const rejectAllPendingDraftActions = (data: AppData): AppData => ({
  ...data,
  draftActions: data.draftActions.map((draft) => (draft.status === 'pending' ? { ...draft, status: 'rejected' } : draft)),
});
