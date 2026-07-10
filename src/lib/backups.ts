import { z } from 'zod';
import type { AppData } from '../types';
import {
  ASSIGNMENT_STATUSES,
  CREW_TRADES,
  ISSUE_CATEGORIES,
  ISSUE_PRIORITIES,
  ISSUE_STATUSES,
  PHOTO_CATEGORIES,
  TRAINING_STATUSES,
  UNIT_WORKFLOW_STATUSES,
  WORK_STATUSES,
} from './constants';
import { normalizeAppData } from './dataMigrations';
import { dataUrlToBlob } from './photoStorage';

const MAX_BACKUP_RECORDS = 250_000;
const RESTORABLE_PHOTO_TYPES = new Set([
  'image/avif',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const nonEmptyText = z.string().trim().min(1);
const text = z.string();
const finiteNumber = z.number().finite();
const nonNegativeNumber = finiteNumber.nonnegative();
const stringList = z.array(z.string());
const knownText = (values: readonly string[], label: string) =>
  z.string().refine((value) => values.includes(value), `Invalid ${label}.`);
const recordSchema = z.object({ id: nonEmptyText }).passthrough();
const projectSchema = recordSchema.extend({
  mode: z.enum(['demo', 'real']).optional(),
  name: nonEmptyText,
  propertyName: text,
  location: text,
  startDate: text,
  endDate: text,
  supervisorName: text,
  projectManagerName: text,
  notes: text,
  estimatedBuildings: nonNegativeNumber,
  estimatedUnits: nonNegativeNumber,
  estimatedBeds: nonNegativeNumber,
  estimatedCommonAreas: nonNegativeNumber,
  aiBudgetUsd: nonNegativeNumber.max(10_000).optional(),
  archivedAt: text.optional(),
  createdAt: text,
  updatedAt: text,
});
const buildingSchema = recordSchema.extend({
  projectId: nonEmptyText,
  name: text,
  notes: text,
  createdAt: text.optional(),
  updatedAt: text.optional(),
});
const floorSchema = recordSchema.extend({
  buildingId: nonEmptyText,
  name: text,
  notes: text,
  createdAt: text.optional(),
  updatedAt: text.optional(),
});
const unitSchema = recordSchema.extend({
  projectId: nonEmptyText,
  buildingId: nonEmptyText,
  floorId: nonEmptyText,
  unitNumber: nonEmptyText,
  bedCount: nonNegativeNumber,
  bathroomCount: nonNegativeNumber,
  hasCommonArea: z.boolean(),
  overallStatus: knownText(UNIT_WORKFLOW_STATUSES, 'Unit status'),
  paintStatus: knownText(WORK_STATUSES, 'paint status'),
  cleanStatus: knownText(WORK_STATUSES, 'clean status'),
  repairStatus: knownText(WORK_STATUSES, 'repair status'),
  flooringStatus: knownText(WORK_STATUSES, 'flooring status'),
  trashStatus: knownText(WORK_STATUSES, 'trash status'),
  inspectionStatus: knownText(WORK_STATUSES, 'inspection status'),
  assignedCrewIds: stringList,
  notes: text,
  createdAt: text,
  updatedAt: text,
});
const crewSchema = recordSchema.extend({
  projectId: nonEmptyText.optional(),
  name: nonEmptyText,
  trade: knownText(CREW_TRADES, 'crew trade'),
  phone: text,
  company: text,
  language: text,
  assignedLocation: text,
  notes: text,
  active: z.boolean(),
  createdAt: text,
  updatedAt: text,
});
const assignmentSchema = recordSchema.extend({
  projectId: nonEmptyText,
  crewMemberId: nonEmptyText.optional(),
  teamName: text,
  trade: knownText(CREW_TRADES, 'assignment trade'),
  buildingId: nonEmptyText.optional(),
  floorId: nonEmptyText.optional(),
  unitIds: stringList,
  scope: text,
  date: text,
  startTime: text,
  expectedCompletion: text,
  actualCompletion: text,
  status: knownText(ASSIGNMENT_STATUSES, 'assignment status'),
  notes: text,
  createdAt: text.optional(),
  updatedAt: text.optional(),
});
const issueSchema = recordSchema.extend({
  projectId: nonEmptyText,
  buildingId: nonEmptyText.optional(),
  floorId: nonEmptyText.optional(),
  unitId: nonEmptyText.optional(),
  title: nonEmptyText,
  category: knownText(ISSUE_CATEGORIES, 'issue category'),
  priority: knownText(ISSUE_PRIORITIES, 'issue priority'),
  owner: text,
  status: knownText(ISSUE_STATUSES, 'issue status'),
  dueAt: text,
  notes: text,
  resolutionNotes: text,
  createdAt: text,
  updatedAt: text,
});
const photoSchema = recordSchema.extend({
  projectId: nonEmptyText,
  buildingId: nonEmptyText.optional(),
  floorId: nonEmptyText.optional(),
  unitId: nonEmptyText.optional(),
  issueId: nonEmptyText.optional(),
  imageData: z.string().optional(),
  localImageAvailable: z.boolean().optional(),
  imageMimeType: text.optional(),
  imageByteSize: nonNegativeNumber.optional(),
  storagePath: text.optional(),
  category: knownText(PHOTO_CATEGORIES, 'photo category'),
  caption: text,
  createdAt: text,
  updatedAt: text.optional(),
});
const dailyLogSchema = recordSchema.extend({
  projectId: nonEmptyText,
  date: nonEmptyText,
  morningPlan: text,
  middayUpdate: text,
  endOfDayReflection: text,
  completedSummary: text,
  blockers: text,
  lessons: text,
  tomorrowPriorities: text,
  createdAt: text,
  updatedAt: text,
});
const reportDraftSchema = recordSchema.extend({
  projectId: nonEmptyText,
  date: nonEmptyText,
  title: text,
  titleEdited: z.boolean().optional(),
  summary: text,
  summaryEdited: z.boolean().optional(),
  sections: z
    .array(
      z.object({
        title: text,
        subtitle: text,
        body: text,
        bodyEdited: z.boolean().optional(),
      }).passthrough(),
    )
    .optional(),
  createdAt: text.optional(),
  updatedAt: text.optional(),
});
const trainingQuestionSchema = recordSchema.extend({
  question: text,
  category: text,
  status: knownText(TRAINING_STATUSES, 'training question status'),
  answer: text,
  followUp: text,
  createdAt: text,
  updatedAt: text,
});
const activityLogSchema = recordSchema.extend({
  projectId: nonEmptyText,
  entityType: knownText(
    [
      'Project',
      'Building',
      'Floor',
      'Unit',
      'CrewMember',
      'Assignment',
      'Issue',
      'PhotoNote',
      'DailyLog',
      'TrainingQuestion',
      'DraftAction',
      'Memory',
      'FollowUpTask',
    ],
    'activity entity type',
  ),
  entityId: nonEmptyText,
  action: text,
  note: text,
  createdAt: text,
});
const draftActionSchema = recordSchema.extend({
  type: knownText(
    [
      'UPDATE_UNIT_STATUS',
      'CREATE_ISSUE',
      'UPDATE_ISSUE',
      'CREATE_CREW_MEMBER',
      'UPDATE_CREW_MEMBER',
      'CREATE_ASSIGNMENT',
      'UPDATE_ASSIGNMENT',
      'ADD_UNIT_NOTE',
      'ADD_DAILY_LOG_ENTRY',
      'CREATE_TRAINING_QUESTION',
      'CREATE_MEMORY_CANDIDATE',
      'CREATE_FOLLOW_UP_TASK',
      'GENERATE_REPORT',
    ],
    'draft action type',
  ),
  title: text,
  summary: text,
  targetEntityType: knownText(
    ['project', 'building', 'floor', 'unit', 'crew', 'assignment', 'issue', 'dailyLog', 'trainingQuestion', 'memory', 'followUpTask', 'report'],
    'draft target type',
  ),
  targetEntityId: nonEmptyText.optional(),
  payload: z.record(z.string(), z.unknown()),
  confidence: finiteNumber.min(0).max(1),
  why: text,
  sourceText: text,
  status: knownText(['pending', 'approved', 'rejected', 'applied', 'failed'], 'draft action status'),
  createdAt: text,
  appliedAt: text.optional(),
  error: text.optional(),
});
const memorySchema = recordSchema.extend({
  projectId: nonEmptyText.optional(),
  memoryType: knownText(
    ['Role Memory', 'Workflow Memory', 'Property Memory', 'Crew Memory', 'Personal Supervisor Preference', 'Lesson Learned'],
    'Memory type',
  ),
  content: text,
  source: text,
  sourceEntityId: nonEmptyText.optional(),
  confidence: finiteNumber.min(0).max(1),
  approved: z.boolean(),
  createdAt: text,
  updatedAt: text,
  lastUsedAt: text.optional(),
});
const memoryCandidateSchema = recordSchema.extend({
  projectId: nonEmptyText.optional(),
  memoryType: knownText(
    ['Role Memory', 'Workflow Memory', 'Property Memory', 'Crew Memory', 'Personal Supervisor Preference', 'Lesson Learned'],
    'Memory candidate type',
  ),
  content: text,
  source: text,
  sourceEntityId: nonEmptyText.optional(),
  confidence: finiteNumber.min(0).max(1),
  status: knownText(['pending', 'approved', 'rejected'], 'Memory candidate status'),
  createdAt: text,
  updatedAt: text,
});
const agentRunSchema = recordSchema.extend({
  projectId: nonEmptyText.optional(),
  mode: knownText(['quick_capture', 'ask_os', 'briefing', 'report', 'memory_extraction'], 'agent run mode'),
  input: text,
  output: z.unknown().optional(),
  status: knownText(['success', 'failed'], 'agent run status'),
  createdAt: text,
  error: text.optional(),
});
const conversationSchema = recordSchema.extend({
  projectId: nonEmptyText.optional(),
  role: knownText(['user', 'assistant'], 'conversation role'),
  content: text,
  supportingRecords: stringList,
  suggestedNextActions: stringList,
  createdAt: text,
});
const followUpSchema = recordSchema.extend({
  title: text,
  description: text,
  priority: knownText(ISSUE_PRIORITIES, 'follow-up priority'),
  dueAt: text,
  owner: text,
  relatedEntityType: knownText(
    ['project', 'building', 'floor', 'unit', 'crew', 'assignment', 'issue', 'dailyLog', 'trainingQuestion', 'memory', 'followUpTask', 'report'],
    'follow-up target type',
  ).optional(),
  relatedEntityId: nonEmptyText.optional(),
  status: knownText(['open', 'in_progress', 'completed', 'dismissed'], 'follow-up status'),
  createdAt: text,
  completedAt: text.optional(),
});
const suggestionSchema = recordSchema.extend({
  type: text,
  title: text,
  description: text,
  priority: knownText(ISSUE_PRIORITIES, 'suggestion priority'),
  relatedEntityType: knownText(
    ['project', 'building', 'floor', 'unit', 'crew', 'assignment', 'issue', 'dailyLog', 'trainingQuestion', 'memory', 'followUpTask', 'report'],
    'suggestion target type',
  ).optional(),
  relatedEntityId: nonEmptyText.optional(),
  status: knownText(['active', 'dismissed', 'completed'], 'suggestion status'),
  createdAt: text,
});

const aiUsageEventSchema = recordSchema.extend({
  projectId: nonEmptyText,
  task: z.literal('capture'),
  model: nonEmptyText,
  modelClass: z.enum(['fast', 'complex', 'override']),
  routeReason: text,
  inputTokens: nonNegativeNumber,
  cachedInputTokens: nonNegativeNumber,
  outputTokens: nonNegativeNumber,
  totalTokens: nonNegativeNumber,
  estimatedCostUsd: nonNegativeNumber,
  pricingVersion: nonEmptyText,
  createdAt: text,
  updatedAt: text,
});

const recordCollectionKeys = [
  'projects',
  'buildings',
  'floors',
  'units',
  'crewMembers',
  'assignments',
  'issues',
  'photoNotes',
  'dailyLogs',
  'reportDrafts',
  'trainingQuestions',
  'activityLogs',
  'draftActions',
  'memories',
  'memoryCandidates',
  'agentRuns',
  'aiUsageEvents',
  'copilotConversations',
  'followUpTasks',
  'smartSuggestions',
] as const;

const appDataBackupSchema = z
  .object({
    activeProjectId: z.string().optional(),
    projects: z.array(projectSchema).min(1, 'At least one project is required.'),
    buildings: z.array(buildingSchema).optional(),
    floors: z.array(floorSchema).optional(),
    units: z.array(unitSchema).optional(),
    crewMembers: z.array(crewSchema).optional(),
    assignments: z.array(assignmentSchema).optional(),
    issues: z.array(issueSchema).optional(),
    photoNotes: z.array(photoSchema).optional(),
    dailyLogs: z.array(dailyLogSchema).optional(),
    reportDrafts: z.array(reportDraftSchema).optional(),
    trainingQuestions: z.array(trainingQuestionSchema).optional(),
    activityLogs: z.array(activityLogSchema).optional(),
    draftActions: z.array(draftActionSchema).optional(),
    memories: z.array(memorySchema).optional(),
    memoryCandidates: z.array(memoryCandidateSchema).optional(),
    agentRuns: z.array(agentRunSchema).optional(),
    aiUsageEvents: z.array(aiUsageEventSchema).optional(),
    copilotConversations: z.array(conversationSchema).optional(),
    followUpTasks: z.array(followUpSchema).optional(),
    smartSuggestions: z.array(suggestionSchema).optional(),
    configurableStatuses: z.array(knownText(UNIT_WORKFLOW_STATUSES, 'configurable Unit status')).optional(),
  })
  .passthrough()
  .superRefine((data, context) => {
    let totalRecords = 0;

    for (const key of recordCollectionKeys) {
      const records = (data[key] ?? []) as Array<{ id: string }>;
      totalRecords += records.length;
      const seenIds = new Set<string>();

      records.forEach((record, index) => {
        if (seenIds.has(record.id)) {
          context.addIssue({
            code: 'custom',
            message: `Duplicate record id "${record.id}".`,
            path: [key, index, 'id'],
          });
        }
        seenIds.add(record.id);
      });
    }

    if (totalRecords > MAX_BACKUP_RECORDS) {
      context.addIssue({
        code: 'custom',
        message: `Backup contains more than ${MAX_BACKUP_RECORDS.toLocaleString()} records.`,
        path: [],
      });
    }
  });

const backupCandidate = (parsed: unknown): unknown => {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return parsed;
  }

  if ('data' in parsed) {
    return parsed.data;
  }

  return parsed;
};

const validationMessage = (result: z.ZodError) => {
  const issue = result.issues[0];
  const path = issue?.path.length ? issue.path.join('.') : 'backup root';
  const detail = issue?.code === 'invalid_type' ? 'Missing or invalid value.' : (issue?.message ?? 'Invalid data.');
  return `That backup is not safe to restore (${path}: ${detail}). No local data was changed.`;
};

export const parseJsonBackup = (text: string): AppData => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error('That backup file is not valid JSON. No local data was changed.');
  }

  const result = appDataBackupSchema.safeParse(backupCandidate(parsed));
  if (!result.success) {
    throw new Error(validationMessage(result.error));
  }

  for (const [index, photo] of (result.data.photoNotes ?? []).entries()) {
    if (!photo.imageData) {
      continue;
    }
    try {
      const blob = dataUrlToBlob(photo.imageData);
      if (!RESTORABLE_PHOTO_TYPES.has(blob.type.toLowerCase())) {
        throw new Error('Unsupported restored photo type.');
      }
    } catch {
      throw new Error(
        `That backup is not safe to restore (photoNotes.${index}.imageData is invalid, unsupported, or too large). No local data was changed.`,
      );
    }
  }

  const normalized = normalizeAppData(result.data as unknown as AppData);
  if (!normalized.projects.some((project) => project.id === normalized.activeProjectId)) {
    throw new Error('That backup does not contain a usable active project. No local data was changed.');
  }

  return normalized;
};
