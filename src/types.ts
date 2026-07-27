export type EntityId = string;

export type UnitWorkflowStatus =
  | 'Not Started'
  | 'Access Blocked'
  | 'Trash Out Needed'
  | 'Trash Out Complete'
  | 'Paint Ready'
  | 'Painting'
  | 'Paint Complete'
  | 'Cleaning Ready'
  | 'Cleaning'
  | 'Cleaning Complete'
  | 'Maintenance Needed'
  | 'Maintenance In Progress'
  | 'Maintenance Complete'
  | 'Punch List'
  | 'Inspection Needed'
  | 'Ready'
  | 'Rework Needed'
  | 'Hold / Blocked';

export type WorkStatus =
  | 'Not Started'
  | 'Needed'
  | 'Ready'
  | 'In Progress'
  | 'Complete'
  | 'Blocked'
  | 'Rework Needed'
  | 'Not Applicable';

export type CrewTrade =
  | 'Painter'
  | 'Cleaner'
  | 'Labor'
  | 'Maintenance'
  | 'Flooring'
  | 'Supervisor'
  | 'Property staff'
  | 'Other';

export type AssignmentStatus =
  | 'Planned'
  | 'Confirmed'
  | 'Checked In'
  | 'In Progress'
  | 'Complete'
  | 'Delayed'
  | 'No Show'
  | 'Reassigned'
  | 'Cancelled';

export type IssueCategory =
  | 'Paint'
  | 'Cleaning'
  | 'Maintenance'
  | 'Flooring'
  | 'Access'
  | 'Keys'
  | 'Materials'
  | 'Crew'
  | 'Safety'
  | 'Property manager'
  | 'Other';

export type IssuePriority = 'Low' | 'Medium' | 'High' | 'Critical';
export type IssueStatus = 'Open' | 'In Progress' | 'Waiting' | 'Resolved' | 'Closed';
export type PhotoCategory = 'Before' | 'During' | 'After' | 'Problem' | 'Completed work' | 'Other';
export type TrainingQuestionStatus = 'Not Asked' | 'Asked' | 'Answered' | 'Needs Follow-Up';
export type ProjectMode = 'demo' | 'real';
export type DraftActionStatus = 'pending' | 'approved' | 'rejected' | 'applied' | 'failed';
export type DraftActionType =
  | 'UPDATE_UNIT_STATUS'
  | 'CREATE_ISSUE'
  | 'UPDATE_ISSUE'
  | 'CREATE_CREW_MEMBER'
  | 'UPDATE_CREW_MEMBER'
  | 'CREATE_ASSIGNMENT'
  | 'UPDATE_ASSIGNMENT'
  | 'ADD_UNIT_NOTE'
  | 'ADD_DAILY_LOG_ENTRY'
  | 'CREATE_TRAINING_QUESTION'
  | 'CREATE_MEMORY_CANDIDATE'
  | 'CREATE_FOLLOW_UP_TASK'
  | 'GENERATE_REPORT';
export type AgentEntityType =
  | 'project'
  | 'building'
  | 'floor'
  | 'unit'
  | 'crew'
  | 'assignment'
  | 'issue'
  | 'dailyLog'
  | 'trainingQuestion'
  | 'memory'
  | 'followUpTask'
  | 'report';
export type MemoryType =
  | 'Role Memory'
  | 'Workflow Memory'
  | 'Property Memory'
  | 'Crew Memory'
  | 'Personal Supervisor Preference'
  | 'Lesson Learned';
export type AgentRunMode = 'quick_capture' | 'ask_os' | 'briefing' | 'report' | 'memory_extraction';
export type AgentRunStatus = 'success' | 'failed';
export type AiModelClass = 'fast' | 'complex' | 'override';
export type AiUsageTask = 'capture';
export type FollowUpTaskStatus = 'open' | 'in_progress' | 'completed' | 'dismissed';
export type SmartSuggestionStatus = 'active' | 'dismissed' | 'completed';
export type SuggestionPriority = 'Low' | 'Medium' | 'High' | 'Critical';
export type CopilotRole = 'user' | 'assistant';
export type BriefingType = 'morning' | 'midday' | 'end_of_day';

export interface Project {
  id: EntityId;
  mode: ProjectMode;
  name: string;
  propertyName: string;
  location: string;
  startDate: string;
  endDate: string;
  supervisorName: string;
  projectManagerName: string;
  notes: string;
  estimatedBuildings: number;
  estimatedUnits: number;
  estimatedBeds: number;
  estimatedCommonAreas: number;
  aiBudgetUsd: number;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Building {
  id: EntityId;
  projectId: EntityId;
  name: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Floor {
  id: EntityId;
  buildingId: EntityId;
  name: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Unit {
  id: EntityId;
  projectId: EntityId;
  buildingId: EntityId;
  floorId: EntityId;
  unitNumber: string;
  bedCount: number;
  bathroomCount: number;
  hasCommonArea: boolean;
  overallStatus: UnitWorkflowStatus;
  paintStatus: WorkStatus;
  cleanStatus: WorkStatus;
  repairStatus: WorkStatus;
  flooringStatus: WorkStatus;
  trashStatus: WorkStatus;
  inspectionStatus: WorkStatus;
  assignedCrewIds: EntityId[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface CrewMember {
  id: EntityId;
  projectId?: EntityId;
  name: string;
  trade: CrewTrade;
  phone: string;
  company: string;
  language: string;
  assignedLocation: string;
  notes: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Assignment {
  id: EntityId;
  projectId: EntityId;
  crewMemberId?: EntityId;
  teamName: string;
  trade: CrewTrade;
  buildingId?: EntityId;
  floorId?: EntityId;
  unitIds: EntityId[];
  scope: string;
  date: string;
  startTime: string;
  expectedCompletion: string;
  actualCompletion: string;
  status: AssignmentStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Issue {
  id: EntityId;
  projectId: EntityId;
  buildingId?: EntityId;
  floorId?: EntityId;
  unitId?: EntityId;
  title: string;
  category: IssueCategory;
  priority: IssuePriority;
  owner: string;
  status: IssueStatus;
  dueAt: string;
  notes: string;
  resolutionNotes: string;
  createdAt: string;
  updatedAt: string;
}

export interface PhotoNote {
  id: EntityId;
  projectId: EntityId;
  buildingId?: EntityId;
  floorId?: EntityId;
  unitId?: EntityId;
  issueId?: EntityId;
  /** Legacy/emergency fallback payload. Normal photo bytes live in IndexedDB. */
  imageData?: string;
  localImageAvailable?: boolean;
  imageMimeType?: string;
  imageByteSize?: number;
  storagePath?: string;
  category: PhotoCategory;
  caption: string;
  createdAt: string;
  updatedAt: string;
}

export interface DailyLog {
  id: EntityId;
  projectId: EntityId;
  date: string;
  morningPlan: string;
  middayUpdate: string;
  endOfDayReflection: string;
  completedSummary: string;
  blockers: string;
  lessons: string;
  tomorrowPriorities: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReportDocumentSectionDraft {
  title: string;
  subtitle: string;
  body: string;
  bodyEdited: boolean;
}

export interface ReportDocumentDraft {
  id: EntityId;
  projectId: EntityId;
  date: string;
  title: string;
  titleEdited: boolean;
  summary: string;
  summaryEdited: boolean;
  sections: ReportDocumentSectionDraft[];
  createdAt: string;
  updatedAt: string;
}

export interface TrainingQuestion {
  id: EntityId;
  question: string;
  category: string;
  status: TrainingQuestionStatus;
  answer: string;
  followUp: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityLog {
  id: EntityId;
  projectId: EntityId;
  entityType:
    | 'Project'
    | 'Building'
    | 'Floor'
    | 'Unit'
    | 'CrewMember'
    | 'Assignment'
    | 'Issue'
    | 'PhotoNote'
    | 'DailyLog'
    | 'TrainingQuestion'
    | 'DraftAction'
    | 'Memory'
    | 'FollowUpTask';
  entityId: EntityId;
  action: string;
  note: string;
  createdAt: string;
}

export interface DraftAction {
  id: EntityId;
  type: DraftActionType;
  title: string;
  summary: string;
  targetEntityType: AgentEntityType;
  targetEntityId?: EntityId;
  payload: Record<string, unknown>;
  confidence: number;
  why: string;
  sourceText: string;
  status: DraftActionStatus;
  createdAt: string;
  appliedAt?: string;
  error?: string;
}

export interface Memory {
  id: EntityId;
  projectId?: EntityId;
  memoryType: MemoryType;
  content: string;
  source: string;
  sourceEntityId?: EntityId;
  confidence: number;
  approved: boolean;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
}

export interface MemoryCandidate {
  id: EntityId;
  projectId?: EntityId;
  memoryType: MemoryType;
  content: string;
  source: string;
  sourceEntityId?: EntityId;
  confidence: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  updatedAt: string;
}

export interface AgentRun {
  id: EntityId;
  projectId?: EntityId;
  mode: AgentRunMode;
  input: string;
  output: unknown;
  status: AgentRunStatus;
  createdAt: string;
  error?: string;
}

export interface AiUsageEvent {
  id: EntityId;
  projectId: EntityId;
  task: AiUsageTask;
  model: string;
  modelClass: AiModelClass;
  routeReason: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  pricingVersion: string;
  createdAt: string;
  updatedAt: string;
}

export interface CopilotConversation {
  id: EntityId;
  projectId?: EntityId;
  role: CopilotRole;
  content: string;
  supportingRecords: string[];
  suggestedNextActions: string[];
  createdAt: string;
}

export interface FollowUpTask {
  id: EntityId;
  title: string;
  description: string;
  priority: IssuePriority;
  dueAt: string;
  owner: string;
  relatedEntityType?: AgentEntityType;
  relatedEntityId?: EntityId;
  status: FollowUpTaskStatus;
  createdAt: string;
  completedAt?: string;
}

export interface SmartSuggestion {
  id: EntityId;
  type: string;
  title: string;
  description: string;
  priority: SuggestionPriority;
  relatedEntityType?: AgentEntityType;
  relatedEntityId?: EntityId;
  status: SmartSuggestionStatus;
  createdAt: string;
}

export interface AppData {
  activeProjectId: EntityId;
  projects: Project[];
  buildings: Building[];
  floors: Floor[];
  units: Unit[];
  crewMembers: CrewMember[];
  assignments: Assignment[];
  issues: Issue[];
  photoNotes: PhotoNote[];
  dailyLogs: DailyLog[];
  reportDrafts: ReportDocumentDraft[];
  trainingQuestions: TrainingQuestion[];
  activityLogs: ActivityLog[];
  draftActions: DraftAction[];
  memories: Memory[];
  memoryCandidates: MemoryCandidate[];
  agentRuns: AgentRun[];
  aiUsageEvents: AiUsageEvent[];
  copilotConversations: CopilotConversation[];
  followUpTasks: FollowUpTask[];
  smartSuggestions: SmartSuggestion[];
  configurableStatuses: UnitWorkflowStatus[];
}

export type AppView =
  | 'dashboard'
  | 'activity'
  | 'more'
  | 'search'
  | 'notifications'
  | 'review'
  | 'sync'
  | 'setup'
  | 'units'
  | 'unitDetail'
  | 'issues'
  | 'crews'
  | 'assignments'
  | 'daily'
  | 'reports'
  | 'copilot'
  | 'training'
  | 'export';

export type UnitStatusFilter = 'All' | 'Blocked' | 'Ready' | 'Not Started' | 'In Progress' | 'Needs Inspection';
