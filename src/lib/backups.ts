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
const isoDate = z.iso.date();
const isoTimestamp = z.iso.datetime({ offset: true });
const knownText = (values: readonly string[], label: string) =>
  z.string().refine((value) => values.includes(value), `Invalid ${label}.`);
const recordSchema = z.object({ id: nonEmptyText }).passthrough();
const projectFieldConfigurationSchema = z.object({
  version: z.literal(1),
  status: z.literal('active'),
  projectId: nonEmptyText,
  activatedAt: isoTimestamp,
  activatedBy: nonEmptyText,
  role: z.literal('turn-supervisor'),
  enabledTrades: z.object({
    paint: z.boolean(),
    clean: z.boolean(),
  }),
  defaultCrewIdsByTrade: z.object({
    paint: stringList,
    clean: stringList,
  }),
  defaultWorkingHoursWording: nonEmptyText,
  defaultWalkthroughScheduleWording: nonEmptyText,
  defaultPropertyContactId: nonEmptyText,
  permissions: z.object({
    personalAppData: z.literal('synthetic-or-explicitly-approved-only'),
    photos: z.enum(['not-confirmed', 'permitted', 'prohibited']),
    paperTurnBoardAuthoritative: z.literal(true),
    payrollCalculations: z.literal(false),
    officialApprovals: z.literal(false),
  }),
});
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
  fieldConfiguration: projectFieldConfigurationSchema.optional(),
  archivedAt: text.optional(),
  createdAt: text,
  updatedAt: text,
});
const propertyContactSchema = recordSchema.extend({
  projectId: nonEmptyText,
  name: nonEmptyText,
  title: nonEmptyText,
  phone: text.optional(),
  isPrimary: z.boolean(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
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
const daySessionKeyStatusSchema = z.enum(['yes', 'no', 'partial-issue']);
const fieldTradeSchema = z.enum(['paint', 'clean']);
const fieldSectionSchema = z.enum(['common', 'A', 'B', 'C', 'D', 'E']);
const daySessionSchema = recordSchema.extend({
  projectId: nonEmptyText,
  date: isoDate,
  startedAt: isoTimestamp,
  startedBy: nonEmptyText,
  propertyContact: nonEmptyText,
  keyStatus: daySessionKeyStatusSchema,
  releaseBatchIds: z.array(nonEmptyText),
  activePaintCrewIds: z.array(nonEmptyText),
  activeCleanCrewIds: z.array(nonEmptyText),
  morningNote: text,
  status: z.enum(['not-started', 'active', 'ending', 'closed', 'reopened']),
  endedAt: isoTimestamp.optional(),
  endKeyStatus: daySessionKeyStatusSchema.optional(),
  paperReviewConfirmedAt: isoTimestamp.optional(),
  propertyCheckInNote: text.optional(),
  endNote: text.optional(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
});
const dailyReleaseItemSchema = recordSchema.extend({
  unitId: nonEmptyText,
  trade: fieldTradeSchema,
  section: fieldSectionSchema,
  restriction: text.optional(),
  workType: z.enum(['full', 'touch-up', 'cut-in']).optional(),
  sourceExcerpt: nonEmptyText,
});
const dailyReleaseBatchSchema = recordSchema.extend({
  projectId: nonEmptyText,
  date: isoDate,
  propertyContact: nonEmptyText,
  sourceType: z.enum(['camera', 'photos', 'file', 'paste', 'manual']),
  sourceLabel: nonEmptyText,
  localSourceReference: nonEmptyText.optional(),
  status: z.enum(['draft', 'confirmed', 'superseded']),
  items: z.array(dailyReleaseItemSchema),
  uncertainties: stringList,
  confirmedBy: nonEmptyText.optional(),
  confirmedAt: isoTimestamp.optional(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
});
const todayTaskSchema = recordSchema.extend({
  projectId: nonEmptyText,
  daySessionId: nonEmptyText,
  date: isoDate,
  unitId: nonEmptyText.optional(),
  trade: fieldTradeSchema.optional(),
  section: fieldSectionSchema.optional(),
  kind: nonEmptyText,
  title: nonEmptyText,
  slot: z.enum(['current', 'next', 'backup', 'queue']),
  status: z.enum(['planned', 'in-progress', 'completed', 'deferred']),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
});
const fieldEventSchema = recordSchema.extend({
  projectId: nonEmptyText,
  daySessionId: nonEmptyText.optional(),
  unitId: nonEmptyText.optional(),
  section: fieldSectionSchema.optional(),
  trade: fieldTradeSchema.optional(),
  actorType: nonEmptyText,
  actorId: nonEmptyText,
  reportedBy: nonEmptyText.optional(),
  occurredAt: isoTimestamp.optional(),
  recordedAt: isoTimestamp,
  recordedBy: nonEmptyText,
  sourceType: nonEmptyText,
  sourceId: nonEmptyText.optional(),
  eventType: nonEmptyText,
  summary: text,
  boundary: z.enum(['personal-record', 'property-reported', 'paper-mirror', 'official-external-reference']),
  reversesEventId: nonEmptyText.optional(),
});
const walkSessionOutcomeSchema = z
  .object({
    selectedItemId: nonEmptyText,
    outcome: z.enum(['accepted', 'correction-requested', 'not-walked', 'deferred']),
  })
  .passthrough();
const walkSessionSchema = recordSchema.extend({
  projectId: nonEmptyText,
  daySessionId: nonEmptyText,
  propertyContact: nonEmptyText,
  startedAt: isoTimestamp,
  startedBy: nonEmptyText,
  selectedItemIds: z.array(nonEmptyText).min(1),
  outcomes: z.array(walkSessionOutcomeSchema),
  status: z.enum(['active', 'closed']),
  endedAt: isoTimestamp.optional(),
  note: text.optional(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
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
  'propertyContacts',
  'buildings',
  'floors',
  'units',
  'crewMembers',
  'assignments',
  'issues',
  'photoNotes',
  'dailyLogs',
  'daySessions',
  'dailyReleaseBatches',
  'todayTasks',
  'fieldEvents',
  'walkSessions',
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

type BackupValidationData = Partial<AppData> & Pick<AppData, 'projects'>;

const appDataBackupShape: z.ZodRawShape = {
    activeProjectId: z.string().optional(),
    projects: z.array(projectSchema).min(1, 'At least one project is required.'),
    propertyContacts: z.array(propertyContactSchema).optional(),
    buildings: z.array(buildingSchema).optional(),
    floors: z.array(floorSchema).optional(),
    units: z.array(unitSchema).optional(),
    crewMembers: z.array(crewSchema).optional(),
    assignments: z.array(assignmentSchema).optional(),
    issues: z.array(issueSchema).optional(),
    photoNotes: z.array(photoSchema).optional(),
    dailyLogs: z.array(dailyLogSchema).optional(),
    daySessions: z.array(daySessionSchema).optional(),
    dailyReleaseBatches: z.array(dailyReleaseBatchSchema).optional(),
    todayTasks: z.array(todayTaskSchema).optional(),
    fieldEvents: z.array(fieldEventSchema).optional(),
    walkSessions: z.array(walkSessionSchema).optional(),
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
};

const appDataStructureSchema = z.object(appDataBackupShape).passthrough();

const appDataBackupSchema = appDataStructureSchema.superRefine((rawData, context) => {
    const data = rawData as unknown as BackupValidationData;
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

    const projectIds = new Set(data.projects.map((project) => project.id));
    const unitProjectIds = new Map((data.units ?? []).map((unit) => [unit.id, unit.projectId]));
    const crewMembersById = new Map((data.crewMembers ?? []).map((crew) => [crew.id, crew]));
    const releaseBatchesById = new Map((data.dailyReleaseBatches ?? []).map((batch) => [batch.id, batch]));
    const daySessionsById = new Map((data.daySessions ?? []).map((session) => [session.id, session]));
    const fieldEventsById = new Map((data.fieldEvents ?? []).map((event) => [event.id, event]));
    const releaseItemsById = new Map<
      string,
      {
        batchId: string;
        projectId: string;
        section: AppData['dailyReleaseBatches'][number]['items'][number]['section'];
        trade: AppData['dailyReleaseBatches'][number]['items'][number]['trade'];
        unitId: string;
      }
    >();
    const validateTimestampOrder = (
      earlier: string | undefined,
      later: string | undefined,
      path: Array<string | number>,
      message: string,
    ) => {
      if (!earlier || !later || Date.parse(earlier) <= Date.parse(later)) {
        return;
      }
      context.addIssue({
        code: 'custom',
        message,
        path,
      });
    };
    const validateProjectScope = (key: string, records: Array<{ projectId: string }>) => {
      records.forEach((record, index) => {
        if (!projectIds.has(record.projectId)) {
          context.addIssue({
            code: 'custom',
            message: 'Local field record references a project that is not in this backup.',
            path: [key, index, 'projectId'],
          });
        }
      });
    };
    validateProjectScope('daySessions', data.daySessions ?? []);
    validateProjectScope('propertyContacts', data.propertyContacts ?? []);
    validateProjectScope('dailyReleaseBatches', data.dailyReleaseBatches ?? []);
    validateProjectScope('todayTasks', data.todayTasks ?? []);
    validateProjectScope('fieldEvents', data.fieldEvents ?? []);
    validateProjectScope('walkSessions', data.walkSessions ?? []);

    const primaryContactCounts = new Map<string, number>();
    (data.propertyContacts ?? []).forEach((contact, index) => {
      if (contact.isPrimary) {
        primaryContactCounts.set(
          contact.projectId,
          (primaryContactCounts.get(contact.projectId) ?? 0) + 1,
        );
      }
      validateTimestampOrder(
        contact.createdAt,
        contact.updatedAt,
        ['propertyContacts', index, 'updatedAt'],
        'Property contact update time cannot precede its creation time.',
      );
    });
    data.projects.forEach((project, index) => {
      const configuration = project.fieldConfiguration;
      if (!configuration) return;
      if (configuration.projectId !== project.id) {
        context.addIssue({
          code: 'custom',
          message: 'Project field configuration must reference its owning project.',
          path: ['projects', index, 'fieldConfiguration', 'projectId'],
        });
      }
      const contacts = (data.propertyContacts ?? []).filter(
        (contact) => contact.projectId === project.id,
      );
      if (
        primaryContactCounts.get(project.id) !== 1
        || !contacts.some((contact) =>
          contact.id === configuration.defaultPropertyContactId
          && contact.isPrimary)
      ) {
        context.addIssue({
          code: 'custom',
          message: 'An activated project requires exactly one matching primary property contact.',
          path: ['projects', index, 'fieldConfiguration', 'defaultPropertyContactId'],
        });
      }
    });

    const openDaySessionByProject = new Map<string, number>();
    (data.daySessions ?? []).forEach((session, index) => {
      const sessionIsOpen = ['active', 'ending', 'reopened'].includes(session.status);
      const seenReleaseBatchIds = new Set<string>();
      session.releaseBatchIds.forEach((releaseBatchId, releaseBatchIndex) => {
        if (seenReleaseBatchIds.has(releaseBatchId)) {
          context.addIssue({
            code: 'custom',
            message: 'A Day Session may reference each release batch only once.',
            path: ['daySessions', index, 'releaseBatchIds', releaseBatchIndex],
          });
        }
        seenReleaseBatchIds.add(releaseBatchId);
        const releaseBatch = releaseBatchesById.get(releaseBatchId);
        if (!releaseBatch || releaseBatch.projectId !== session.projectId) {
          context.addIssue({
            code: 'custom',
            message: 'Day Session release batch must exist in the same project.',
            path: ['daySessions', index, 'releaseBatchIds', releaseBatchIndex],
          });
          return;
        }
        if (sessionIsOpen && releaseBatch.status !== 'confirmed') {
          context.addIssue({
            code: 'custom',
            message: 'An active, ending, or reopened Day Session may use only a confirmed release batch.',
            path: ['daySessions', index, 'releaseBatchIds', releaseBatchIndex],
          });
        }
        if (session.status === 'closed' && releaseBatch.status === 'draft') {
          context.addIssue({
            code: 'custom',
            message: 'A closed Day Session cannot reference a draft release batch.',
            path: ['daySessions', index, 'releaseBatchIds', releaseBatchIndex],
          });
        }
        if (
          session.status === 'closed' &&
          releaseBatch.status === 'superseded' &&
          (!releaseBatch.confirmedBy || !releaseBatch.confirmedAt)
        ) {
          context.addIssue({
            code: 'custom',
            message: 'A superseded release linked to a closed Day Session requires its original confirmation evidence.',
            path: ['daySessions', index, 'releaseBatchIds', releaseBatchIndex],
          });
        }
        if (releaseBatch.date !== session.date) {
          context.addIssue({
            code: 'custom',
            message: 'A Day Session release batch must match the Day Session date.',
            path: ['daySessions', index, 'releaseBatchIds', releaseBatchIndex],
          });
        }
      });
      if (sessionIsOpen && session.releaseBatchIds.length === 0) {
        context.addIssue({
          code: 'custom',
          message: 'An active, ending, or reopened Day Session requires a confirmed release batch.',
          path: ['daySessions', index, 'releaseBatchIds'],
        });
      }
      const validateActiveCrewIds = (
        crewIds: string[],
        key: 'activePaintCrewIds' | 'activeCleanCrewIds',
        expectedTrade: 'Painter' | 'Cleaner',
      ) => {
        const seenCrewIds = new Set<string>();
        crewIds.forEach((crewId, crewIndex) => {
          if (seenCrewIds.has(crewId)) {
            context.addIssue({
              code: 'custom',
              message: 'A Day Session may reference each active crew only once per trade.',
              path: ['daySessions', index, key, crewIndex],
            });
          }
          seenCrewIds.add(crewId);
          const crew = crewMembersById.get(crewId);
          if (!crew || crew.projectId !== session.projectId || crew.trade !== expectedTrade) {
            context.addIssue({
              code: 'custom',
              message: `Active ${expectedTrade} crew must exist in the same project and match the trade.`,
              path: ['daySessions', index, key, crewIndex],
            });
          }
        });
      };
      validateActiveCrewIds(session.activePaintCrewIds, 'activePaintCrewIds', 'Painter');
      validateActiveCrewIds(session.activeCleanCrewIds, 'activeCleanCrewIds', 'Cleaner');
      validateTimestampOrder(
        session.createdAt,
        session.startedAt,
        ['daySessions', index, 'startedAt'],
        'Day Session startedAt cannot be earlier than createdAt.',
      );
      validateTimestampOrder(
        session.startedAt,
        session.updatedAt,
        ['daySessions', index, 'updatedAt'],
        'Day Session updatedAt cannot be earlier than startedAt.',
      );
      if (session.status === 'closed' && !session.endedAt) {
        context.addIssue({
          code: 'custom',
          message: 'A closed Day Session requires endedAt.',
          path: ['daySessions', index, 'endedAt'],
        });
      }
      if (session.status !== 'closed' && session.endedAt) {
        context.addIssue({
          code: 'custom',
          message: 'Only a closed Day Session may have endedAt.',
          path: ['daySessions', index, 'endedAt'],
        });
      }
      validateTimestampOrder(
        session.startedAt,
        session.endedAt,
        ['daySessions', index, 'endedAt'],
        'Day Session endedAt cannot be earlier than startedAt.',
      );
      validateTimestampOrder(
        session.endedAt,
        session.updatedAt,
        ['daySessions', index, 'updatedAt'],
        'Day Session updatedAt cannot be earlier than endedAt.',
      );
      validateTimestampOrder(
        session.startedAt,
        session.paperReviewConfirmedAt,
        ['daySessions', index, 'paperReviewConfirmedAt'],
        'Paper review confirmation cannot be earlier than Day Session start.',
      );
      validateTimestampOrder(
        session.paperReviewConfirmedAt,
        session.updatedAt,
        ['daySessions', index, 'updatedAt'],
        'Day Session updatedAt cannot be earlier than paper review confirmation.',
      );
      if (!sessionIsOpen) {
        return;
      }
      const existingIndex = openDaySessionByProject.get(session.projectId);
      if (existingIndex !== undefined) {
        context.addIssue({
          code: 'custom',
          message: 'Only one active, ending, or reopened Day Session is allowed per project.',
          path: ['daySessions', index, 'status'],
        });
      } else {
        openDaySessionByProject.set(session.projectId, index);
      }
    });

    (data.dailyReleaseBatches ?? []).forEach((batch, batchIndex) => {
      if (batch.status === 'confirmed' && (!batch.confirmedBy || !batch.confirmedAt)) {
        context.addIssue({
          code: 'custom',
          message: 'A confirmed release requires confirmedBy and confirmedAt.',
          path: ['dailyReleaseBatches', batchIndex, !batch.confirmedBy ? 'confirmedBy' : 'confirmedAt'],
        });
      }
      if (batch.status === 'confirmed' && batch.items.length === 0) {
        context.addIssue({
          code: 'custom',
          message: 'A confirmed release requires at least one released Unit, trade, and section item.',
          path: ['dailyReleaseBatches', batchIndex, 'items'],
        });
      }
      validateTimestampOrder(
        batch.createdAt,
        batch.updatedAt,
        ['dailyReleaseBatches', batchIndex, 'updatedAt'],
        'Release updatedAt cannot be earlier than createdAt.',
      );
      validateTimestampOrder(
        batch.createdAt,
        batch.confirmedAt,
        ['dailyReleaseBatches', batchIndex, 'confirmedAt'],
        'Release confirmedAt cannot be earlier than createdAt.',
      );
      validateTimestampOrder(
        batch.confirmedAt,
        batch.updatedAt,
        ['dailyReleaseBatches', batchIndex, 'updatedAt'],
        'Release updatedAt cannot be earlier than confirmedAt.',
      );
      const seenScopeKeys = new Set<string>();
      batch.items.forEach((item, itemIndex) => {
        if (unitProjectIds.get(item.unitId) !== batch.projectId) {
          context.addIssue({
            code: 'custom',
            message: 'Release item Unit must exist in the same project as its release batch.',
            path: ['dailyReleaseBatches', batchIndex, 'items', itemIndex, 'unitId'],
          });
        }
        if (releaseItemsById.has(item.id)) {
          context.addIssue({
            code: 'custom',
            message: `Duplicate release item id "${item.id}".`,
            path: ['dailyReleaseBatches', batchIndex, 'items', itemIndex, 'id'],
          });
        }
        releaseItemsById.set(item.id, {
          batchId: batch.id,
          projectId: batch.projectId,
          section: item.section,
          trade: item.trade,
          unitId: item.unitId,
        });
        const scopeKey = `${item.unitId}\u0000${item.trade}\u0000${item.section}`;
        if (seenScopeKeys.has(scopeKey)) {
          context.addIssue({
            code: 'custom',
            message: 'A release batch may contain each Unit, trade, and section scope only once.',
            path: ['dailyReleaseBatches', batchIndex, 'items', itemIndex],
          });
        }
        seenScopeKeys.add(scopeKey);
      });
    });

    (data.todayTasks ?? []).forEach((task, taskIndex) => {
      const taskUnitIsValid = !task.unitId || unitProjectIds.get(task.unitId) === task.projectId;
      const daySession = daySessionsById.get(task.daySessionId);
      if (!daySession || daySession.projectId !== task.projectId) {
        context.addIssue({
          code: 'custom',
          message: 'Today Task Day Session must exist in the same project.',
          path: ['todayTasks', taskIndex, 'daySessionId'],
        });
      } else if (daySession.date !== task.date) {
        context.addIssue({
          code: 'custom',
          message: 'Today Task date must match its Day Session date.',
          path: ['todayTasks', taskIndex, 'date'],
        });
      } else {
        const confirmedReleaseItems = daySession.releaseBatchIds.flatMap((releaseBatchId) => {
          const batch = releaseBatchesById.get(releaseBatchId);
          const retainsConfirmationEvidence =
            batch?.status === 'confirmed' ||
            (batch?.status === 'superseded' && Boolean(batch.confirmedBy && batch.confirmedAt));
          return retainsConfirmationEvidence ? batch.items : [];
        });
        const scopeExists = confirmedReleaseItems.some(
          (item) =>
            (!task.unitId || item.unitId === task.unitId) &&
            (!task.trade || item.trade === task.trade) &&
            (!task.section || item.section === task.section),
        );
        if (taskUnitIsValid && !scopeExists) {
          context.addIssue({
            code: 'custom',
            message: 'Today Task scope must exist in a confirmed release selected for its Day Session.',
            path: ['todayTasks', taskIndex],
          });
        }
        if (daySession.status === 'closed' && ['planned', 'in-progress'].includes(task.status)) {
          context.addIssue({
            code: 'custom',
            message: 'A closed Day Session cannot retain planned or in-progress Today Tasks.',
            path: ['todayTasks', taskIndex, 'status'],
          });
        }
        validateTimestampOrder(
          daySession.startedAt,
          task.updatedAt,
          ['todayTasks', taskIndex, 'updatedAt'],
          'Today Task updatedAt cannot be earlier than its Day Session start.',
        );
        validateTimestampOrder(
          task.updatedAt,
          daySession.endedAt,
          ['todayTasks', taskIndex, 'updatedAt'],
          'Today Task updatedAt cannot be later than its closed Day Session end.',
        );
      }
      if (!taskUnitIsValid) {
        context.addIssue({
          code: 'custom',
          message: 'Today Task Unit must exist in the same project.',
          path: ['todayTasks', taskIndex, 'unitId'],
        });
      }
      validateTimestampOrder(
        task.createdAt,
        task.updatedAt,
        ['todayTasks', taskIndex, 'updatedAt'],
        'Today Task updatedAt cannot be earlier than createdAt.',
      );
    });

    (data.fieldEvents ?? []).forEach((event, eventIndex) => {
      if (event.daySessionId) {
        const daySession = daySessionsById.get(event.daySessionId);
        if (!daySession || daySession.projectId !== event.projectId) {
          context.addIssue({
            code: 'custom',
            message: 'Field Event Day Session must exist in the same project.',
            path: ['fieldEvents', eventIndex, 'daySessionId'],
          });
        } else {
          validateTimestampOrder(
            daySession.startedAt,
            event.recordedAt,
            ['fieldEvents', eventIndex, 'recordedAt'],
            'Field Event recordedAt cannot be earlier than its Day Session start.',
          );
          validateTimestampOrder(
            event.recordedAt,
            daySession.endedAt,
            ['fieldEvents', eventIndex, 'recordedAt'],
            'Field Event recordedAt cannot be later than its closed Day Session end.',
          );
          validateTimestampOrder(
            daySession.startedAt,
            event.occurredAt,
            ['fieldEvents', eventIndex, 'occurredAt'],
            'Field Event occurredAt cannot be earlier than its Day Session start.',
          );
        }
      }
      validateTimestampOrder(
        event.occurredAt,
        event.recordedAt,
        ['fieldEvents', eventIndex, 'occurredAt'],
        'Field Event occurredAt cannot be later than recordedAt.',
      );
      if (event.unitId && unitProjectIds.get(event.unitId) !== event.projectId) {
        context.addIssue({
          code: 'custom',
          message: 'Field Event Unit must exist in the same project.',
          path: ['fieldEvents', eventIndex, 'unitId'],
        });
      }
      if (event.reversesEventId) {
        const reversedEvent = fieldEventsById.get(event.reversesEventId);
        if (
          !reversedEvent ||
          reversedEvent.projectId !== event.projectId ||
          reversedEvent.id === event.id ||
          !event.daySessionId ||
          reversedEvent.daySessionId !== event.daySessionId
        ) {
          context.addIssue({
            code: 'custom',
            message: 'A reversing Field Event must reference a different event in the same Day Session.',
            path: ['fieldEvents', eventIndex, 'reversesEventId'],
          });
        } else {
          validateTimestampOrder(
            reversedEvent.recordedAt,
            event.recordedAt,
            ['fieldEvents', eventIndex, 'recordedAt'],
            'A reversing Field Event cannot be recorded before the event it reverses.',
          );
        }
      }
    });

    const blockingFieldEventTypes = new Set([
      'callback-opened',
      'callback-correction-reported',
      'property-correction-requested',
    ]);
    const activeFieldEventsForReleaseItemAt = (
      projectId: string,
      releaseItem: {
        section: AppData['dailyReleaseBatches'][number]['items'][number]['section'];
        trade: AppData['dailyReleaseBatches'][number]['items'][number]['trade'];
        unitId: string;
      },
      at: string,
    ) => {
      const eventsThroughCutoff = (data.fieldEvents ?? []).filter(
        (event) =>
          event.projectId === projectId &&
          Date.parse(event.recordedAt) <= Date.parse(at),
      );
      const reversedEventIds = new Set(
        eventsThroughCutoff
          .filter((event) => {
            if (!event.reversesEventId) {
              return false;
            }
            const reversedEvent = fieldEventsById.get(event.reversesEventId);
            return Boolean(reversedEvent && reversedEvent.projectId === projectId);
          })
          .map((event) => event.reversesEventId as string),
      );

      return eventsThroughCutoff.filter(
        (event) =>
          !reversedEventIds.has(event.id) &&
          event.unitId === releaseItem.unitId &&
          event.trade === releaseItem.trade &&
          event.section === releaseItem.section,
      );
    };

    const activeWalkByDaySession = new Map<string, number>();
    (data.walkSessions ?? []).forEach((session, sessionIndex) => {
      const daySession = daySessionsById.get(session.daySessionId);
      if (!daySession || daySession.projectId !== session.projectId) {
        context.addIssue({
          code: 'custom',
          message: 'Walk Session Day Session must exist in the same project.',
          path: ['walkSessions', sessionIndex, 'daySessionId'],
        });
      } else if (daySession.status === 'not-started') {
        context.addIssue({
          code: 'custom',
          message: 'A Walk Session cannot begin before its Day Session starts.',
          path: ['walkSessions', sessionIndex, 'daySessionId'],
        });
      } else if (session.status === 'active' && daySession.status === 'closed') {
        context.addIssue({
          code: 'custom',
          message: 'An active Walk Session cannot remain open after its Day Session closes.',
          path: ['walkSessions', sessionIndex, 'status'],
        });
      } else {
        validateTimestampOrder(
          daySession.startedAt,
          session.startedAt,
          ['walkSessions', sessionIndex, 'startedAt'],
          'Walk Session cannot start before its Day Session.',
        );
        validateTimestampOrder(
          session.endedAt ?? session.updatedAt,
          daySession.endedAt,
          ['walkSessions', sessionIndex, session.endedAt ? 'endedAt' : 'updatedAt'],
          'Walk Session cannot extend past its closed Day Session end.',
        );
      }
      if (session.status === 'active') {
        const existingIndex = activeWalkByDaySession.get(session.daySessionId);
        if (existingIndex !== undefined) {
          context.addIssue({
            code: 'custom',
            message: 'Only one active Walk Session is allowed per Day Session.',
            path: ['walkSessions', sessionIndex, 'status'],
          });
        } else {
          activeWalkByDaySession.set(session.daySessionId, sessionIndex);
        }
      }
      if (session.status === 'closed' && !session.endedAt) {
        context.addIssue({
          code: 'custom',
          message: 'A closed Walk Session requires endedAt.',
          path: ['walkSessions', sessionIndex, 'endedAt'],
        });
      }
      if (session.status === 'active' && session.endedAt) {
        context.addIssue({
          code: 'custom',
          message: 'An active Walk Session cannot have endedAt.',
          path: ['walkSessions', sessionIndex, 'endedAt'],
        });
      }
      validateTimestampOrder(
        session.createdAt,
        session.startedAt,
        ['walkSessions', sessionIndex, 'startedAt'],
        'Walk Session startedAt cannot be earlier than createdAt.',
      );
      validateTimestampOrder(
        session.startedAt,
        session.endedAt,
        ['walkSessions', sessionIndex, 'endedAt'],
        'Walk Session endedAt cannot be earlier than startedAt.',
      );
      validateTimestampOrder(
        session.endedAt ?? session.startedAt,
        session.updatedAt,
        ['walkSessions', sessionIndex, 'updatedAt'],
        'Walk Session updatedAt cannot be earlier than its latest lifecycle timestamp.',
      );
      const selectedItemIds = new Set(session.selectedItemIds);
      if (selectedItemIds.size !== session.selectedItemIds.length) {
        context.addIssue({
          code: 'custom',
          message: 'A Walk Session may select each release item only once.',
          path: ['walkSessions', sessionIndex, 'selectedItemIds'],
        });
      }
      const projectReleaseBatchIds = new Set(
        (data.daySessions ?? [])
          .filter((candidate) => candidate.projectId === session.projectId)
          .flatMap((candidate) => candidate.releaseBatchIds),
      );
      session.selectedItemIds.forEach((selectedItemId, selectedItemIndex) => {
        const releaseItem = releaseItemsById.get(selectedItemId);
        const releaseBatch = releaseItem
          ? releaseBatchesById.get(releaseItem.batchId)
          : undefined;
        const retainsConfirmationEvidence =
          releaseBatch?.status === 'confirmed'
          || (
            releaseBatch?.status === 'superseded'
            && Boolean(releaseBatch.confirmedBy && releaseBatch.confirmedAt)
          );
        if (
          !releaseItem ||
          releaseItem.projectId !== session.projectId ||
          !projectReleaseBatchIds.has(releaseItem.batchId) ||
          !retainsConfirmationEvidence
        ) {
          context.addIssue({
            code: 'custom',
            message: 'Walk selection must reference confirmed project work released by a Day Session.',
            path: ['walkSessions', sessionIndex, 'selectedItemIds', selectedItemIndex],
          });
        }
      });
      const seenOutcomeIds = new Set<string>();
      session.outcomes.forEach((outcome, outcomeIndex) => {
        if (!selectedItemIds.has(outcome.selectedItemId)) {
          context.addIssue({
            code: 'custom',
            message: 'Walk outcome must reference a selected item.',
            path: ['walkSessions', sessionIndex, 'outcomes', outcomeIndex, 'selectedItemId'],
          });
        }
        if (seenOutcomeIds.has(outcome.selectedItemId)) {
          context.addIssue({
            code: 'custom',
            message: 'A selected walk item may have only one current outcome.',
            path: ['walkSessions', sessionIndex, 'outcomes', outcomeIndex, 'selectedItemId'],
          });
        }
        seenOutcomeIds.add(outcome.selectedItemId);
        if (session.status === 'closed' && outcome.outcome === 'accepted') {
          const releaseItem = releaseItemsById.get(outcome.selectedItemId);
          if (releaseItem) {
            const activeEvents = activeFieldEventsForReleaseItemAt(
              session.projectId,
              releaseItem,
              session.startedAt,
            );
            const latestLosInspectionPass = activeEvents
              .filter((event) =>
                event.eventType === 'los-passed'
                || event.eventType === 'callback-resolved')
              .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))[0];
            if (!latestLosInspectionPass) {
              context.addIssue({
                code: 'custom',
                message: 'Property acceptance requires a current Los inspection pass for the project scope.',
                path: ['walkSessions', sessionIndex, 'outcomes', outcomeIndex, 'outcome'],
              });
            } else if (
              activeEvents.some(
                (event) =>
                  blockingFieldEventTypes.has(event.eventType) &&
                  event.recordedAt >= latestLosInspectionPass.recordedAt,
              )
            ) {
              context.addIssue({
                code: 'custom',
                message: 'Property acceptance requires the selected scope to be unblocked after Los inspection.',
                path: ['walkSessions', sessionIndex, 'outcomes', outcomeIndex, 'outcome'],
              });
            }

            const alreadyAcceptedByEvent = activeEvents.some(
              (event) => event.eventType === 'property-accepted',
            );
            const alreadyAcceptedByWalk = (data.walkSessions ?? []).some(
              (otherSession) =>
                otherSession.id !== session.id &&
                otherSession.projectId === session.projectId &&
                otherSession.status === 'closed' &&
                otherSession.outcomes.some(
                  (otherOutcome) =>
                    otherOutcome.selectedItemId === outcome.selectedItemId &&
                    otherOutcome.outcome === 'accepted',
                ),
            );
            if (alreadyAcceptedByEvent || alreadyAcceptedByWalk) {
              context.addIssue({
                code: 'custom',
                message: 'Property acceptance cannot be recorded again for scope already accepted in this project.',
                path: ['walkSessions', sessionIndex, 'outcomes', outcomeIndex, 'outcome'],
              });
            }
          }
        }
      });
      if (session.status === 'closed') {
        session.selectedItemIds.forEach((selectedItemId, selectedItemIndex) => {
          if (!seenOutcomeIds.has(selectedItemId)) {
            context.addIssue({
              code: 'custom',
              message: 'A closed Walk Session requires one outcome for every selected item.',
              path: ['walkSessions', sessionIndex, 'selectedItemIds', selectedItemIndex],
            });
          }
        });
      }
    });
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

export interface StoredAppDataValidationIssue {
  readonly message: string;
  readonly path: string;
}

export class StoredAppDataValidationError extends Error {
  readonly issues: readonly StoredAppDataValidationIssue[];

  constructor(message: string, issues: readonly StoredAppDataValidationIssue[]) {
    super(message);
    this.name = 'StoredAppDataValidationError';
    this.issues = issues;
  }
}

const toStoredIssue = (issue: z.core.$ZodIssue): StoredAppDataValidationIssue => ({
  message: issue.message,
  path: issue.path.length ? issue.path.join('.') : 'data root',
});

const recoverableSemanticIssue = (issue: z.core.$ZodIssue) => {
  if (issue.code !== 'custom') return false;
  return [
    /cannot be (?:earlier|later|recorded before)/iu,
    /cannot (?:precede|start before|extend past)/iu,
    /requires (?:endedAt|a confirmed release batch|one outcome)/iu,
    /Only (?:a closed Day Session|one active)/iu,
    /may (?:reference|select) each .+ only once/iu,
    /may have only one current outcome/iu,
    /cannot retain planned or in-progress Today Tasks/iu,
    /cannot remain open after its Day Session closes/iu,
    /cannot have endedAt/iu,
    /date must match its Day Session date/iu,
    /updatedAt cannot/iu,
  ].some((pattern) => pattern.test(issue.message));
};

const validateEmbeddedPhotos = (
  data: BackupValidationData,
  toError: (index: number) => Error,
) => {
  for (const [index, photo] of (data.photoNotes ?? []).entries()) {
    if (!photo.imageData) continue;
    try {
      const blob = dataUrlToBlob(photo.imageData);
      if (!RESTORABLE_PHOTO_TYPES.has(blob.type.toLowerCase())) {
        throw new Error('Unsupported restored photo type.');
      }
    } catch {
      throw toError(index);
    }
  }
};

// Release-scope editing can legitimately empty a confirmed batch (every
// "mark not released" strips items; every re-release makes a new mini-batch).
// An empty confirmed batch carries no evidence and fails validation — repair
// it on load instead of locking Los's REAL Turn behind recovery mode.
const repairStoredCandidate = (candidate: unknown): unknown => {
  if (!candidate || typeof candidate !== 'object') return candidate;
  const data = candidate as {
    dailyReleaseBatches?: { id?: unknown; status?: unknown; items?: unknown[] }[];
    daySessions?: { releaseBatchIds?: unknown[] }[];
  };
  if (!Array.isArray(data.dailyReleaseBatches)) return candidate;
  const emptyIds = new Set(
    data.dailyReleaseBatches
      .filter((batch) => batch
        && batch.status === 'confirmed'
        && Array.isArray(batch.items)
        && batch.items.length === 0
        && typeof batch.id === 'string')
      .map((batch) => batch.id as string),
  );
  if (emptyIds.size === 0) return candidate;
  return {
    ...data,
    dailyReleaseBatches: data.dailyReleaseBatches
      .filter((batch) => !(typeof batch?.id === 'string' && emptyIds.has(batch.id))),
    daySessions: Array.isArray(data.daySessions)
      ? data.daySessions.map((session) =>
        session && Array.isArray(session.releaseBatchIds)
          ? {
            ...session,
            releaseBatchIds: session.releaseBatchIds
              .filter((id) => !(typeof id === 'string' && emptyIds.has(id))),
          }
          : session)
      : data.daySessions,
  };
};

export const parseStoredAppData = (textValue: string): {
  readonly data: AppData;
  readonly warnings: readonly StoredAppDataValidationIssue[];
} => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(textValue) as unknown;
  } catch {
    throw new StoredAppDataValidationError(
      'Saved data is not valid JSON.',
      [{ message: 'The preserved payload is not valid JSON.', path: 'data root' }],
    );
  }

  const candidate = repairStoredCandidate(backupCandidate(parsed));
  const structure = appDataStructureSchema.safeParse(candidate);
  if (!structure.success) {
    const issues = structure.error.issues.map(toStoredIssue);
    throw new StoredAppDataValidationError(
      'Saved data is missing required records or contains invalid record shapes.',
      issues,
    );
  }

  const fullValidation = appDataBackupSchema.safeParse(candidate);
  const issues = fullValidation.success ? [] : fullValidation.error.issues;
  const fatalIssues = issues.filter((issue) => !recoverableSemanticIssue(issue));
  if (fatalIssues.length > 0) {
    throw new StoredAppDataValidationError(
      'Saved data failed ownership, identity, or authority validation.',
      fatalIssues.map(toStoredIssue),
    );
  }

  const validatedData = structure.data as unknown as BackupValidationData;
  validateEmbeddedPhotos(
    validatedData,
    (index) => new StoredAppDataValidationError(
      'Saved photo data is invalid or unsupported.',
      [{
        message: 'Embedded photo data is invalid, unsupported, or too large.',
        path: `photoNotes.${index}.imageData`,
      }],
    ),
  );
  const normalized = normalizeAppData(validatedData as AppData);
  if (!normalized.projects.some((project) => project.id === normalized.activeProjectId)) {
    throw new StoredAppDataValidationError(
      'Saved data does not contain a usable active project.',
      [{ message: 'The active project does not exist in the project collection.', path: 'activeProjectId' }],
    );
  }

  return {
    data: normalized,
    warnings: issues.map(toStoredIssue),
  };
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

  const validatedData = result.data as unknown as BackupValidationData;
  validateEmbeddedPhotos(
    validatedData,
    (index) => new Error(
      `That backup is not safe to restore (photoNotes.${index}.imageData is invalid, unsupported, or too large). No local data was changed.`,
    ),
  );

  const normalized = normalizeAppData(validatedData as AppData);
  if (!normalized.projects.some((project) => project.id === normalized.activeProjectId)) {
    throw new Error('That backup does not contain a usable active project. No local data was changed.');
  }

  return normalized;
};
