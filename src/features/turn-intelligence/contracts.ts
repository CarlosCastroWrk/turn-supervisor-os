import { z } from 'zod';

export const ROUTINE_MODEL_ID = 'moonshotai/kimi-k2.6' as const;
export const COMPLEX_MODEL_ID = 'moonshotai/kimi-k3' as const;
export const MOCK_MODEL_ID = 'turn-os/mock-intelligence' as const;

export const intelligenceTierSchema = z.enum(['no-model', 'routine', 'complex']);
export type IntelligenceTier = z.infer<typeof intelligenceTierSchema>;

export const intelligenceTaskSchema = z.enum([
  'auto',
  'count',
  'progress',
  'filter',
  'status_lookup',
  'safety_check',
  'general_chat',
  'spanish_draft',
  'summarize',
  'normal_visual',
  'structured_routine',
  'difficult_visual',
  'conflict_analysis',
  'long_ambiguous',
  'low_confidence',
  'deep_analysis',
]);
export type IntelligenceTask = z.infer<typeof intelligenceTaskSchema>;

export const turnTradeSchema = z.enum(['paint', 'clean']);
export const turnSectionSchema = z.enum(['common', 'A', 'B', 'C', 'D', 'E']);

export const turnChatContextSchema = z.object({
  kind: z.enum(['property', 'unit', 'trade-section', 'general']),
  propertyId: z.string().trim().min(1).max(120).optional(),
  propertyName: z.string().trim().min(1).max(160).optional(),
  unitId: z.string().trim().min(1).max(120).optional(),
  unitNumber: z.string().trim().min(1).max(40).optional(),
  trade: turnTradeSchema.optional(),
  section: turnSectionSchema.optional(),
  synthetic: z.boolean(),
}).strict().superRefine((context, issue) => {
  if (context.kind === 'unit' && (!context.unitId || !context.unitNumber)) {
    issue.addIssue({ code: 'custom', message: 'Unit context requires a Unit identifier and number.' });
  }
  if (context.kind === 'trade-section' &&
      (!context.unitId || !context.unitNumber || !context.trade || !context.section)) {
    issue.addIssue({ code: 'custom', message: 'Trade-section context is incomplete.' });
  }
});
export type TurnChatContext = z.infer<typeof turnChatContextSchema>;

export const intelligenceSourceSchema = z.object({
  id: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(200),
  kind: z.enum(['approved-knowledge', 'uploaded-source', 'record-reference']),
  trust: z.enum(['approved-knowledge', 'untrusted']),
  authorization: z.literal('none'),
  excerpt: z.string().max(4_000).optional(),
}).strict().superRefine((source, issue) => {
  if (source.kind === 'uploaded-source' && source.trust !== 'untrusted') {
    issue.addIssue({ code: 'custom', message: 'Uploaded sources must remain untrusted.' });
  }
});
export type IntelligenceSource = z.infer<typeof intelligenceSourceSchema>;

export const intelligenceAttachmentSchema = z.object({
  id: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(180),
  kind: z.enum(['image', 'file']),
  mediaType: z.string().trim().min(1).max(120),
  sizeBytes: z.number().int().nonnegative().max(5_000_000),
  availability: z.literal('reference-only'),
  sourceId: z.string().trim().min(1).max(120).optional(),
}).strict();
export type IntelligenceAttachment = z.infer<typeof intelligenceAttachmentSchema>;

export const turnChatMessageSchema = z.object({
  id: z.string().trim().min(1).max(120),
  role: z.enum(['user', 'assistant']),
  content: z.string().max(8_000),
  createdAt: z.string().datetime(),
  sourceIds: z.array(z.string().trim().min(1).max(120)).max(12),
}).strict();
export type TurnChatMessage = z.infer<typeof turnChatMessageSchema>;

export const turnIntelligenceRequestSchema = z.object({
  requestId: z.string().trim().min(1).max(120),
  task: intelligenceTaskSchema,
  context: turnChatContextSchema,
  messages: z.array(turnChatMessageSchema).min(1).max(24),
  attachments: z.array(intelligenceAttachmentSchema).max(4),
  sources: z.array(intelligenceSourceSchema).max(8),
}).strict().superRefine((request, issue) => {
  const sourceIds = new Set(request.sources.map((source) => source.id));
  for (const attachment of request.attachments) {
    if (attachment.sourceId && !sourceIds.has(attachment.sourceId)) {
      issue.addIssue({ code: 'custom', message: `Attachment ${attachment.id} references an unknown source.` });
    }
  }
});
export type TurnIntelligenceRequest = z.infer<typeof turnIntelligenceRequestSchema>;

export const routeDecisionSchema = z.object({
  tier: intelligenceTierSchema,
  task: intelligenceTaskSchema,
  modelId: z.enum([ROUTINE_MODEL_ID, COMPLEX_MODEL_ID]).nullable(),
  reason: z.string().min(1).max(240),
  deterministic: z.boolean(),
}).strict();
export type RouteDecision = z.infer<typeof routeDecisionSchema>;

export const providerIdentitySchema = z.object({
  provider: z.string().min(1).max(80),
  modelId: z.string().min(1).max(160),
  mode: z.enum(['gateway', 'mock', 'unavailable']),
  displayName: z.string().min(1).max(160),
}).strict();
export type ProviderIdentity = z.infer<typeof providerIdentitySchema>;

export const usageReceiptSchema = z.object({
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  totalTokens: z.number().int().nonnegative().nullable(),
  estimatedCostUsd: z.number().nonnegative().nullable(),
  costSource: z.enum(['gateway-reported', 'provider-reported', 'unknown']),
}).strict();
export type UsageReceipt = z.infer<typeof usageReceiptSchema>;

export const healthReceiptSchema = z.object({
  status: z.enum(['available', 'degraded', 'disabled', 'unavailable']),
  checkedAt: z.string().datetime(),
  detail: z.string().max(240),
}).strict();
export type HealthReceipt = z.infer<typeof healthReceiptSchema>;

export const cancellationReceiptSchema = z.object({
  supported: z.boolean(),
  cancelled: z.boolean(),
  reason: z.string().max(240).nullable(),
}).strict();
export type CancellationReceipt = z.infer<typeof cancellationReceiptSchema>;

export const proposalToolNameSchema = z.enum([
  'propose_daily_goal',
  'propose_note',
  'propose_assignment',
  'propose_crew_report',
  'propose_inspection_result',
  'propose_callback',
  'propose_blocker',
  'propose_property_walk',
  'draft_spanish_message',
  'draft_tony_update',
  'parse_assignment_source',
]);
export type ProposalToolName = z.infer<typeof proposalToolNameSchema>;

export const turnProposalSchema = z.object({
  id: z.string().trim().min(1).max(120),
  toolName: proposalToolNameSchema,
  title: z.string().trim().min(1).max(180),
  exactSourceText: z.string().min(1).max(8_000),
  editableDraft: z.string().min(1).max(8_000),
  status: z.enum(['pending', 'approved', 'rejected', 'saved-note']),
  applied: z.literal(false),
  createdAt: z.string().datetime(),
  context: turnChatContextSchema,
  evidenceSourceIds: z.array(z.string().trim().min(1).max(120)).max(12),
}).strict();
export type TurnProposal = z.infer<typeof turnProposalSchema>;

export const intelligenceDiagnosticsSchema = z.object({
  requestId: z.string().min(1).max(120),
  provider: providerIdentitySchema,
  route: routeDecisionSchema,
  usage: usageReceiptSchema,
  latencyMs: z.number().int().nonnegative(),
  success: z.boolean(),
  proposalOutcome: z.enum(['none', 'pending', 'approved', 'edited', 'rejected', 'saved-note']),
  sourceCount: z.number().int().nonnegative(),
}).strict();
export type IntelligenceDiagnostics = z.infer<typeof intelligenceDiagnosticsSchema>;

export const intelligenceStreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('route'), decision: routeDecisionSchema }).strict(),
  z.object({ type: z.literal('text-delta'), text: z.string().min(1).max(8_000) }).strict(),
  z.object({ type: z.literal('source'), source: intelligenceSourceSchema }).strict(),
  z.object({ type: z.literal('proposal'), proposal: turnProposalSchema }).strict(),
  z.object({ type: z.literal('diagnostics'), diagnostics: intelligenceDiagnosticsSchema }).strict(),
  z.object({ type: z.literal('done'), cancelled: z.boolean() }).strict(),
  z.object({
    type: z.literal('error'),
    code: z.enum(['DISABLED', 'UNAVAILABLE', 'INVALID_OUTPUT', 'CANCELLED']),
    message: z.string().min(1).max(280),
    retryable: z.boolean(),
  }).strict(),
]);
export type IntelligenceStreamEvent = z.infer<typeof intelligenceStreamEventSchema>;

export interface ProviderVisualInput {
  id: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
  data: Uint8Array;
  source: IntelligenceSource;
}

export interface ProviderRequest {
  request: TurnIntelligenceRequest;
  route: RouteDecision;
  systemPrompt: string;
  visuals: readonly ProviderVisualInput[];
}

export interface TurnIntelligenceProvider {
  readonly identity: ProviderIdentity;
  health(): Promise<HealthReceipt>;
  stream(request: ProviderRequest, signal?: AbortSignal): AsyncIterable<IntelligenceStreamEvent>;
  structured<T>(
    request: ProviderRequest,
    schema: z.ZodType<T>,
    signal?: AbortSignal,
  ): Promise<T>;
}

export interface TurnIntelligenceClient {
  stream(request: TurnIntelligenceRequest, signal?: AbortSignal): AsyncIterable<IntelligenceStreamEvent>;
}
