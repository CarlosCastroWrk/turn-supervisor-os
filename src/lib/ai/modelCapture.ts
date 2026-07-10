import { z } from 'zod';
import type { AppData, DraftAction } from '../../types.js';
import { createId, nowISO, todayISO } from '../constants.js';
import { agentParseResultSchema, type AgentParseResult } from './types.js';

const unitWorkflowStatusSchema = z.enum([
  'Not Started',
  'Access Blocked',
  'Trash Out Needed',
  'Trash Out Complete',
  'Paint Ready',
  'Painting',
  'Paint Complete',
  'Cleaning Ready',
  'Cleaning',
  'Cleaning Complete',
  'Maintenance Needed',
  'Maintenance In Progress',
  'Maintenance Complete',
  'Punch List',
  'Inspection Needed',
  'Ready',
  'Rework Needed',
  'Hold / Blocked',
]);

const workStatusSchema = z.enum([
  'Not Started',
  'Needed',
  'Ready',
  'In Progress',
  'Complete',
  'Blocked',
  'Rework Needed',
  'Not Applicable',
]);

const issueCategorySchema = z.enum([
  'Paint',
  'Cleaning',
  'Maintenance',
  'Flooring',
  'Access',
  'Keys',
  'Materials',
  'Crew',
  'Safety',
  'Property manager',
  'Other',
]);

const issuePrioritySchema = z.enum(['Low', 'Medium', 'High', 'Critical']);
const crewTradeSchema = z.enum(['Painter', 'Cleaner', 'Labor', 'Maintenance', 'Flooring', 'Supervisor', 'Property staff', 'Other']);
const assignmentStatusSchema = z.enum(['Planned', 'Confirmed', 'Checked In', 'In Progress', 'Complete', 'Delayed', 'No Show', 'Reassigned', 'Cancelled']);
const dailyLogSectionSchema = z.enum(['morningPlan', 'middayUpdate', 'endOfDayReflection', 'blockers', 'lessons', 'tomorrowPriorities']);

const modelUnitContextSchema = z.object({
  id: z.string().min(1).max(160),
  unitNumber: z.string().min(1).max(24),
  overallStatus: unitWorkflowStatusSchema,
  paintStatus: workStatusSchema,
  cleanStatus: workStatusSchema,
  repairStatus: workStatusSchema,
  inspectionStatus: workStatusSchema,
}).strict();

const modelCrewContextSchema = z.object({
  id: z.string().min(1).max(160),
  name: z.string().min(1).max(160),
  trade: crewTradeSchema,
  assignedLocation: z.string().max(200),
}).strict();

const modelIssueContextSchema = z.object({
  id: z.string().min(1).max(160),
  unitNumber: z.string().max(24),
  title: z.string().min(1).max(200),
  category: issueCategorySchema,
  status: z.enum(['Open', 'In Progress', 'Waiting', 'Resolved', 'Closed']),
}).strict();

export const modelCaptureRequestSchema = z.object({
  input: z.string().trim().min(1).max(6_000),
  project: z.object({
    id: z.string().min(1).max(160),
    name: z.string().min(1).max(200),
    mode: z.enum(['demo', 'real']),
    fieldDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).strict(),
  referencedUnits: z.array(modelUnitContextSchema).max(20),
  activeCrews: z.array(modelCrewContextSchema).max(25),
  relatedOpenIssues: z.array(modelIssueContextSchema).max(20),
}).strict();

export type ModelCaptureRequest = z.infer<typeof modelCaptureRequestSchema>;

export const modelCaptureActionSchema = z.object({
  kind: z.enum([
    'UPDATE_UNIT_STATUS',
    'CREATE_ISSUE',
    'CREATE_ASSIGNMENT',
    'ADD_UNIT_NOTE',
    'ADD_DAILY_LOG_ENTRY',
    'CREATE_FOLLOW_UP_TASK',
  ]),
  unitNumbers: z.array(z.string().min(1).max(24)).max(10),
  title: z.string().min(1).max(180),
  summary: z.string().min(1).max(700),
  overallStatus: unitWorkflowStatusSchema.nullable(),
  paintStatus: workStatusSchema.nullable(),
  cleanStatus: workStatusSchema.nullable(),
  repairStatus: workStatusSchema.nullable(),
  inspectionStatus: workStatusSchema.nullable(),
  issueCategory: issueCategorySchema.nullable(),
  issuePriority: issuePrioritySchema.nullable(),
  owner: z.string().max(160),
  trade: crewTradeSchema.nullable(),
  assignmentStatus: assignmentStatusSchema.nullable(),
  crewName: z.string().max(160),
  noteText: z.string().max(1_500),
  dailyLogSection: dailyLogSectionSchema.nullable(),
  dueDate: z.string().max(20),
  confidence: z.number().min(0).max(1),
  why: z.string().min(1).max(700),
}).strict();

export type ModelCaptureAction = z.infer<typeof modelCaptureActionSchema>;

export const modelCaptureOutputSchema = z.object({
  detectedUnits: z.array(z.string().min(1).max(24)).max(20),
  detectedBuildings: z.array(z.string().min(1).max(120)).max(10),
  detectedFloors: z.array(z.string().min(1).max(120)).max(10),
  detectedCrews: z.array(z.string().min(1).max(160)).max(20),
  actions: z.array(modelCaptureActionSchema).max(12),
  clarificationQuestions: z.array(z.string().min(1).max(300)).max(5),
  warnings: z.array(z.string().min(1).max(300)).max(5),
  confidence: z.number().min(0).max(1),
}).strict();

export type ModelCaptureOutput = z.infer<typeof modelCaptureOutputSchema>;

export const modelCaptureApiResponseSchema = z.object({
  requestId: z.string().min(1),
  result: agentParseResultSchema,
}).strict();

const unique = <T,>(items: T[]) => Array.from(new Set(items));

const referencedUnitNumbers = (input: string) =>
  unique(Array.from(input.matchAll(/\b(?:unit\s*#?\s*)?(\d{3,4})\b/gi)).map((match) => match[1])).slice(0, 20);

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const configuredUnitNumbersInInput = (input: string, data: AppData, projectId: string) =>
  unique(
    data.units
      .filter((unit) => unit.projectId === projectId && unit.unitNumber.trim())
      .map((unit) => {
        const match = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(unit.unitNumber.trim())}(?=$|[^a-z0-9])`, 'i').exec(input);
        return match ? { index: match.index, unitNumber: unit.unitNumber } : null;
      })
      .filter((match): match is { index: number; unitNumber: string } => Boolean(match))
      .sort((a, b) => a.index - b.index)
      .map((match) => match.unitNumber),
  ).slice(0, 20);

export const buildModelCaptureRequest = (input: string, data: AppData): ModelCaptureRequest => {
  const project = data.projects.find((item) => item.id === data.activeProjectId);
  if (!project) {
    throw new Error('Active project is unavailable.');
  }

  const unitNumbers = new Set(configuredUnitNumbersInInput(input, data, project.id));
  const referencedUnits = data.units
    .filter((unit) => unit.projectId === project.id && unitNumbers.has(unit.unitNumber))
    .slice(0, 20)
    .map((unit) => ({
      id: unit.id,
      unitNumber: unit.unitNumber,
      overallStatus: unit.overallStatus,
      paintStatus: unit.paintStatus,
      cleanStatus: unit.cleanStatus,
      repairStatus: unit.repairStatus,
      inspectionStatus: unit.inspectionStatus,
    }));
  const unitNumberById = new Map(referencedUnits.map((unit) => [unit.id, unit.unitNumber]));

  return modelCaptureRequestSchema.parse({
    input,
    project: {
      id: project.id,
      name: project.name || project.propertyName || 'Current Turn',
      mode: project.mode,
      fieldDate: todayISO(),
    },
    referencedUnits,
    activeCrews: data.crewMembers
      .filter((crew) => crew.projectId === project.id && crew.active)
      .slice(0, 25)
      .map((crew) => ({
        id: crew.id,
        name: crew.name,
        trade: crew.trade,
        assignedLocation: crew.assignedLocation,
      })),
    relatedOpenIssues: data.issues
      .filter(
        (issue) =>
          issue.projectId === project.id &&
          !['Resolved', 'Closed'].includes(issue.status) &&
          Boolean(issue.unitId && unitNumberById.has(issue.unitId)),
      )
      .slice(0, 20)
      .map((issue) => ({
        id: issue.id,
        unitNumber: issue.unitId ? unitNumberById.get(issue.unitId) ?? '' : '',
        title: issue.title,
        category: issue.category,
        status: issue.status,
      })),
  });
};

const compactPayload = (entries: Array<[string, unknown]>) =>
  Object.fromEntries(entries.filter(([, value]) => value !== null && value !== undefined && value !== ''));

const payloadString = (draft: DraftAction, key: string) => {
  const value = draft.payload[key];
  return typeof value === 'string' ? value : '';
};

const statusPayloadKeys = ['paintStatus', 'cleanStatus', 'repairStatus', 'inspectionStatus'] as const;
const blockingOverallStatuses = new Set(['Access Blocked', 'Hold / Blocked']);
const normalizedDueAt = (value: string, warnings: string[], actionTitle: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?$/.test(trimmed)) return trimmed;
  warnings.push(`AI due time was removed because it was not a valid field date for: ${actionTitle}.`);
  return '';
};

export const withCaptureConflictWarnings = (draftActions: DraftAction[]) => {
  const updateDraftsByUnit = new Map<string, DraftAction[]>();
  draftActions.forEach((draft) => {
    if (draft.type !== 'UPDATE_UNIT_STATUS') return;
    const unitNumber = payloadString(draft, 'unitNumber');
    if (!unitNumber) return;
    updateDraftsByUnit.set(unitNumber, [...(updateDraftsByUnit.get(unitNumber) ?? []), draft]);
  });

  const conflictUnits = Array.from(updateDraftsByUnit.entries())
    .filter(([, drafts]) => {
      const statusConflict = statusPayloadKeys.some(
        (key) => new Set(drafts.map((draft) => draft.payload[key]).filter(Boolean)).size > 1,
      );
      const overallStatuses = new Set(drafts.map((draft) => draft.payload.overallStatus).filter(Boolean));
      const overallConflict =
        overallStatuses.size > 1 && !Array.from(overallStatuses).some((status) => blockingOverallStatuses.has(String(status)));
      return statusConflict || overallConflict;
    })
    .map(([unitNumber]) => unitNumber);

  if (conflictUnits.length === 0) {
    return { conflictUnits, draftActions };
  }

  const conflictSet = new Set(conflictUnits);
  return {
    conflictUnits,
    draftActions: draftActions.map((draft) => {
      const unitNumber = payloadString(draft, 'unitNumber');
      if (draft.type !== 'UPDATE_UNIT_STATUS' || !conflictSet.has(unitNumber)) return draft;
      const conflictReason = `Capture produced conflicting status drafts for Unit ${unitNumber}. Confirm the correct draft before approving.`;
      return {
        ...draft,
        summary: draft.summary.includes('Conflict confirmation required')
          ? draft.summary
          : `${draft.summary} Conflict confirmation required.`,
        confidence: Math.min(draft.confidence, 0.58),
        why: draft.why.includes(conflictReason) ? draft.why : `${draft.why} ${conflictReason}`,
        payload: {
          ...draft.payload,
          requiresConflictConfirmation: true,
          conflictReason,
        },
      };
    }),
  };
};

interface ModelResultMetadata {
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export const convertModelCaptureOutput = (
  output: ModelCaptureOutput,
  request: ModelCaptureRequest,
  metadata: ModelResultMetadata,
): AgentParseResult => {
  const unitByNumber = new Map(request.referencedUnits.map((unit) => [unit.unitNumber, unit]));
  const warnings = [...output.warnings];
  const clarificationQuestions = [...output.clarificationQuestions];
  const draftActions: DraftAction[] = [];
  const createdAt = nowISO();

  for (const action of output.actions) {
    const unitNumbers = unique(action.unitNumbers);
    const knownUnits = unitNumbers.map((unitNumber) => unitByNumber.get(unitNumber)).filter(Boolean);
    const unknownUnits = unitNumbers.filter((unitNumber) => !unitByNumber.has(unitNumber));
    const requiresSingleKnownUnit = ['UPDATE_UNIT_STATUS', 'CREATE_ISSUE', 'ADD_UNIT_NOTE'].includes(action.kind);

    if (requiresSingleKnownUnit && (unitNumbers.length !== 1 || knownUnits.length !== 1)) {
      const label = unknownUnits.length > 0 ? unknownUnits.join(', ') : unitNumbers.join(', ') || 'missing Unit';
      warnings.push(`AI proposal skipped because its Unit target is not confirmed in this Turn: ${label}.`);
      clarificationQuestions.push(`Confirm the correct Unit for: ${action.title}`);
      continue;
    }

    const optionalUnitTarget = ['CREATE_ASSIGNMENT', 'CREATE_FOLLOW_UP_TASK'].includes(action.kind);
    if (optionalUnitTarget && unitNumbers.length > 0 && knownUnits.length === 0) {
      warnings.push(`AI proposal skipped because none of its Unit targets are confirmed in this Turn: ${unknownUnits.join(', ')}.`);
      clarificationQuestions.push(`Confirm the correct Unit target for: ${action.title}`);
      continue;
    }

    const primaryUnit = knownUnits[0];
    const dueAt = normalizedDueAt(action.dueDate, warnings, action.title);
    let targetEntityType: DraftAction['targetEntityType'] = 'project';
    let targetEntityId: string | undefined;
    let payload: Record<string, unknown> = {};

    if (action.kind === 'UPDATE_UNIT_STATUS') {
      payload = compactPayload([
        ['unitNumber', primaryUnit?.unitNumber],
        ['overallStatus', action.overallStatus],
        ['paintStatus', action.paintStatus],
        ['cleanStatus', action.cleanStatus],
        ['repairStatus', action.repairStatus],
        ['inspectionStatus', action.inspectionStatus],
      ]);
      if (Object.keys(payload).length === 1) {
        warnings.push(`AI proposal skipped because it did not include a status change for Unit ${primaryUnit?.unitNumber}.`);
        continue;
      }
      targetEntityType = 'unit';
      targetEntityId = primaryUnit?.id;
    } else if (action.kind === 'CREATE_ISSUE') {
      targetEntityType = 'unit';
      targetEntityId = primaryUnit?.id;
      payload = compactPayload([
        ['unitNumber', primaryUnit?.unitNumber],
        ['title', action.title],
        ['category', action.issueCategory ?? 'Other'],
        ['priority', action.issuePriority ?? 'Medium'],
        ['owner', action.owner],
        ['status', 'Open'],
        ['dueAt', dueAt],
        ['notes', action.noteText || action.summary],
      ]);
    } else if (action.kind === 'CREATE_ASSIGNMENT') {
      const safeUnitNumbers = knownUnits.map((unit) => unit?.unitNumber).filter((value): value is string => Boolean(value));
      if (unknownUnits.length > 0) {
        warnings.push(`Unknown Unit(s) were removed from an assignment proposal: ${unknownUnits.join(', ')}.`);
      }
      targetEntityType = 'assignment';
      payload = compactPayload([
        ['unitNumbers', safeUnitNumbers],
        ['teamName', action.crewName || 'Crew update'],
        ['trade', action.trade ?? 'Other'],
        ['status', action.assignmentStatus ?? 'In Progress'],
        ['scope', action.noteText || action.summary],
        ['date', request.project.fieldDate],
      ]);
    } else if (action.kind === 'ADD_UNIT_NOTE') {
      targetEntityType = 'unit';
      targetEntityId = primaryUnit?.id;
      payload = {
        unitNumber: primaryUnit?.unitNumber,
        note: action.noteText || action.summary,
      };
    } else if (action.kind === 'ADD_DAILY_LOG_ENTRY') {
      targetEntityType = 'dailyLog';
      payload = {
        date: request.project.fieldDate,
        section: action.dailyLogSection ?? 'middayUpdate',
        text: action.noteText || action.summary,
      };
    } else if (action.kind === 'CREATE_FOLLOW_UP_TASK') {
      const relatedUnit = knownUnits[0];
      targetEntityType = relatedUnit ? 'unit' : 'followUpTask';
      targetEntityId = relatedUnit?.id;
      payload = compactPayload([
        ['title', action.title],
        ['description', action.noteText || action.summary],
        ['priority', action.issuePriority ?? 'Medium'],
        ['owner', action.owner || 'Los'],
        ['dueAt', dueAt],
        ['relatedEntityType', relatedUnit ? 'unit' : 'project'],
        ['relatedEntityId', relatedUnit?.id ?? request.project.id],
      ]);
    }

    draftActions.push({
      id: createId('draft'),
      type: action.kind,
      title: action.title.trim(),
      summary: action.summary.trim(),
      targetEntityType,
      targetEntityId,
      payload,
      confidence: action.confidence,
      why: action.why.trim(),
      sourceText: request.input,
      status: 'pending',
      createdAt,
    });
  }

  const conflictCheck = withCaptureConflictWarnings(draftActions);
  if (conflictCheck.conflictUnits.length > 0) {
    warnings.push(`Conflicting AI status proposals need confirmation for Unit(s): ${conflictCheck.conflictUnits.join(', ')}.`);
  }

  const uniqueWarnings = unique(warnings).slice(0, 10);
  const uniqueQuestions = unique(clarificationQuestions).slice(0, 10);

  return agentParseResultSchema.parse({
    summary: `Secure AI assist proposed ${conflictCheck.draftActions.length} draft action(s).`,
    rawInput: request.input,
    detectedEntities: {
      units: unique([
        ...request.referencedUnits.map((unit) => unit.unitNumber),
        ...referencedUnitNumbers(request.input),
        ...output.detectedUnits,
      ]),
      buildings: unique(output.detectedBuildings),
      floors: unique(output.detectedFloors),
      crews: unique(output.detectedCrews),
      issues: conflictCheck.draftActions.filter((draft) => draft.type === 'CREATE_ISSUE').map((draft) => draft.title),
    },
    draftActions: conflictCheck.draftActions,
    memoryCandidates: [],
    clarificationQuestions: uniqueQuestions,
    warnings: uniqueWarnings,
    confidence: output.confidence,
    provider: 'openai',
    model: metadata.model,
    usage: {
      inputTokens: metadata.inputTokens ?? 0,
      outputTokens: metadata.outputTokens ?? 0,
      totalTokens: metadata.totalTokens ?? 0,
    },
    providerNotice: 'Secure AI assist used. Review every proposed change.',
  });
};

const normalizedText = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const fallbackCollisionKey = (draft: DraftAction) => {
  const unitNumber = payloadString(draft, 'unitNumber');
  if (draft.type === 'UPDATE_UNIT_STATUS') {
    return [draft.type, unitNumber, ...['overallStatus', ...statusPayloadKeys].map((key) => payloadString(draft, key))].join('|');
  }
  if (draft.type === 'CREATE_ISSUE') {
    return [draft.type, unitNumber, payloadString(draft, 'category')].join('|');
  }
  if (draft.type === 'CREATE_ASSIGNMENT') {
    const unitNumbers = Array.isArray(draft.payload.unitNumbers) ? [...draft.payload.unitNumbers].sort().join(',') : '';
    return [draft.type, normalizedText(payloadString(draft, 'teamName')), unitNumbers].join('|');
  }
  return [draft.type, unitNumber, normalizedText(draft.title)].join('|');
};

export const mergeModelAndDeterministicCapture = (
  modelResult: AgentParseResult,
  deterministicResult: AgentParseResult,
): AgentParseResult => {
  const modelKeys = new Set(modelResult.draftActions.map(fallbackCollisionKey));
  const fallbackDrafts = deterministicResult.draftActions.filter((draft) => !modelKeys.has(fallbackCollisionKey(draft)));
  const conflictCheck = withCaptureConflictWarnings([...modelResult.draftActions, ...fallbackDrafts].slice(0, 20));
  const warnings = unique([
    ...modelResult.warnings,
    ...deterministicResult.warnings,
    ...(conflictCheck.conflictUnits.length > 0
      ? [`Conflicting combined status drafts need confirmation for Unit(s): ${conflictCheck.conflictUnits.join(', ')}.`]
      : []),
  ]);

  return agentParseResultSchema.parse({
    ...modelResult,
    summary: `Secure AI assist and safety parser found ${conflictCheck.draftActions.length} draft action(s).`,
    detectedEntities: {
      units: unique([...modelResult.detectedEntities.units, ...deterministicResult.detectedEntities.units]),
      buildings: unique([...modelResult.detectedEntities.buildings, ...deterministicResult.detectedEntities.buildings]),
      floors: unique([...modelResult.detectedEntities.floors, ...deterministicResult.detectedEntities.floors]),
      crews: unique([...modelResult.detectedEntities.crews, ...deterministicResult.detectedEntities.crews]),
      issues: unique([...modelResult.detectedEntities.issues, ...deterministicResult.detectedEntities.issues]),
    },
    draftActions: conflictCheck.draftActions,
    memoryCandidates: deterministicResult.memoryCandidates,
    clarificationQuestions: unique([
      ...modelResult.clarificationQuestions,
      ...deterministicResult.clarificationQuestions,
    ]),
    warnings,
    confidence: Math.min(modelResult.confidence, deterministicResult.confidence + 0.08),
    provider: 'openai',
    providerNotice: 'Secure AI assist used with the offline safety parser. Review every proposed change.',
  });
};
