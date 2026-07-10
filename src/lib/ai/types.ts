import { z } from 'zod';
import type { AppData, BriefingType, DraftAction, MemoryCandidate } from '../../types.js';

const draftActionTypeSchema = z.enum([
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
]);

const targetEntitySchema = z.enum([
  'project',
  'building',
  'floor',
  'unit',
  'crew',
  'assignment',
  'issue',
  'dailyLog',
  'trainingQuestion',
  'memory',
  'followUpTask',
  'report',
]);

const memoryTypeSchema = z.enum([
  'Role Memory',
  'Workflow Memory',
  'Property Memory',
  'Crew Memory',
  'Personal Supervisor Preference',
  'Lesson Learned',
]);

export const draftActionSchema = z.object({
  id: z.string(),
  type: draftActionTypeSchema,
  title: z.string(),
  summary: z.string(),
  targetEntityType: targetEntitySchema,
  targetEntityId: z.string().optional(),
  payload: z.record(z.string(), z.unknown()),
  confidence: z.number().min(0).max(1),
  why: z.string(),
  sourceText: z.string(),
  status: z.enum(['pending', 'approved', 'rejected', 'applied', 'failed']),
  createdAt: z.string(),
  appliedAt: z.string().optional(),
  error: z.string().optional(),
}) satisfies z.ZodType<DraftAction>;

export const memoryCandidateSchema = z.object({
  id: z.string(),
  projectId: z.string().optional(),
  memoryType: memoryTypeSchema,
  content: z.string(),
  source: z.string(),
  sourceEntityId: z.string().optional(),
  confidence: z.number().min(0).max(1),
  status: z.enum(['pending', 'approved', 'rejected']),
  createdAt: z.string(),
  updatedAt: z.string(),
}) satisfies z.ZodType<MemoryCandidate>;

export const agentParseResultSchema = z.object({
  summary: z.string(),
  rawInput: z.string(),
  detectedEntities: z.object({
    units: z.array(z.string()),
    buildings: z.array(z.string()),
    floors: z.array(z.string()),
    crews: z.array(z.string()),
    issues: z.array(z.string()),
  }),
  draftActions: z.array(draftActionSchema),
  memoryCandidates: z.array(memoryCandidateSchema),
  clarificationQuestions: z.array(z.string()),
  warnings: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  provider: z.enum(['deterministic', 'openai']).default('deterministic'),
  model: z.string().optional(),
  usage: z.object({
    inputTokens: z.number().int().nonnegative(),
    cachedInputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
    estimatedCostUsd: z.number().nonnegative().optional(),
    pricingVersion: z.string().optional(),
    modelClass: z.enum(['fast', 'complex', 'override']).optional(),
    routeReason: z.string().optional(),
    requestId: z.string().optional(),
  }).optional(),
  providerNotice: z.string().optional(),
});

export type AgentParseResult = z.infer<typeof agentParseResultSchema>;

export interface AskOsResult {
  question: string;
  conciseAnswer: string;
  supportingRecords: string[];
  uncertainty: string[];
  suggestedNextActions: string[];
  usedMemoryIds?: string[];
  createdAt: string;
}

export interface BriefingResult {
  type: BriefingType;
  title: string;
  body: string;
  supportingRecords: string[];
  suggestedNextActions: string[];
  usedMemoryIds?: string[];
  createdAt: string;
}

export interface AgentProvider {
  parseQuickCapture(input: string, data: AppData): Promise<AgentParseResult>;
  askOs(question: string, data: AppData): Promise<AskOsResult>;
  generateBriefing(type: BriefingType, data: AppData): Promise<BriefingResult>;
}
