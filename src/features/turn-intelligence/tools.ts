import { z } from 'zod';
import {
  proposalToolNameSchema,
  type ProposalToolName,
  type TurnChatContext,
  type TurnProposal,
} from './contracts';
import { createPendingProposal } from './proposals';

export const readToolNameSchema = z.enum([
  'get_property_summary',
  'search_units',
  'get_unit',
  'get_unit_history',
  'get_needs_me',
  'get_daily_progress',
  'get_callbacks',
  'get_ready_for_walk',
  'get_crew_assignments',
  'get_approved_knowledge',
]);
export type ReadToolName = z.infer<typeof readToolNameSchema>;

const identifier = z.string().trim().min(1).max(120);
const boundedQuery = z.string().trim().min(1).max(500);
const date = z.string().date();

export const READ_TOOL_INPUTS: Record<ReadToolName, z.ZodType> = {
  get_property_summary: z.object({ propertyId: identifier }).strict(),
  search_units: z.object({ propertyId: identifier, query: boundedQuery, limit: z.number().int().min(1).max(50) }).strict(),
  get_unit: z.object({ unitId: identifier }).strict(),
  get_unit_history: z.object({ unitId: identifier, limit: z.number().int().min(1).max(100) }).strict(),
  get_needs_me: z.object({ propertyId: identifier }).strict(),
  get_daily_progress: z.object({ propertyId: identifier, date, trade: z.enum(['paint', 'clean']).optional() }).strict(),
  get_callbacks: z.object({ propertyId: identifier, unitId: identifier.optional() }).strict(),
  get_ready_for_walk: z.object({ propertyId: identifier, trade: z.enum(['paint', 'clean']).optional() }).strict(),
  get_crew_assignments: z.object({ propertyId: identifier, unitId: identifier.optional() }).strict(),
  get_approved_knowledge: z.object({ query: boundedQuery, limit: z.number().int().min(1).max(12) }).strict(),
};

const proposalInputSchema = z.object({
  title: z.string().trim().min(1).max(180),
  editableDraft: z.string().min(1).max(8_000),
  evidenceSourceIds: z.array(identifier).max(12),
}).strict();

export const readToolPayloadSchema = z.object({
  available: z.boolean(),
  data: z.json(),
  sourceIds: z.array(identifier).max(50),
  synthetic: z.boolean(),
  authorization: z.literal('none'),
  reason: z.string().trim().min(1).max(240).optional(),
}).strict();
export type ReadToolPayload = z.infer<typeof readToolPayloadSchema>;

export const PROPOSAL_TOOL_INPUTS: Record<ProposalToolName, z.ZodType> = {
  propose_daily_goal: proposalInputSchema,
  propose_note: proposalInputSchema,
  propose_assignment: proposalInputSchema,
  propose_crew_report: proposalInputSchema,
  propose_inspection_result: proposalInputSchema,
  propose_callback: proposalInputSchema,
  propose_blocker: proposalInputSchema,
  propose_property_walk: proposalInputSchema,
  draft_spanish_message: proposalInputSchema,
  draft_tony_update: proposalInputSchema,
  parse_assignment_source: proposalInputSchema,
};

export const READ_TOOL_NAMES = readToolNameSchema.options;
export const PROPOSAL_TOOL_NAMES = proposalToolNameSchema.options;

export const TOOL_DESCRIPTIONS: Record<ReadToolName | ProposalToolName, string> = {
  get_property_summary: 'Read a host-provided property summary. Never writes or approves work.',
  search_units: 'Search host-provided Unit references. Never navigates or mutates automatically.',
  get_unit: 'Read one host-provided Unit record.',
  get_unit_history: 'Read the host-provided personal Unit history.',
  get_needs_me: 'Read the deterministic Needs Me queue.',
  get_daily_progress: 'Read deterministic daily progress figures.',
  get_callbacks: 'Read callback records supplied by the host.',
  get_ready_for_walk: 'Read records the host identifies as ready for Los to walk.',
  get_crew_assignments: 'Read host-provided personal crew assignment references.',
  get_approved_knowledge: 'Search only approved knowledge supplied by the host.',
  propose_daily_goal: 'Create an editable daily-goal proposal. Does not save or apply it.',
  propose_note: 'Create an editable note proposal. Does not save or apply it.',
  propose_assignment: 'Create an editable personal assignment proposal. Does not assign a crew.',
  propose_crew_report: 'Create an editable crew-report proposal. Does not change work state.',
  propose_inspection_result: 'Create an editable inspection proposal. Does not mark an inspection or approval.',
  propose_callback: 'Create an editable callback proposal. Does not create an operational callback.',
  propose_blocker: 'Create an editable blocker proposal. Does not change a Unit.',
  propose_property_walk: 'Create an editable property-walk proposal. Does not obtain signoff.',
  draft_spanish_message: 'Draft editable Spanish wording. Does not send a message.',
  draft_tony_update: 'Draft an editable update for Tony. Does not send a message.',
  parse_assignment_source: 'Propose a non-authoritative interpretation of an assignment source. Never authorizes work.',
};

export interface ReadToolRuntime {
  read(name: ReadToolName, input: unknown): Promise<ReadToolPayload>;
}

export type IntelligenceToolResult =
  | { kind: 'read-result'; toolName: ReadToolName; data: unknown }
  | { kind: 'proposal'; toolName: ProposalToolName; proposal: TurnProposal };

export const executeReadTool = async (
  runtime: ReadToolRuntime,
  name: ReadToolName,
  input: unknown,
): Promise<IntelligenceToolResult> => {
  const parsed = READ_TOOL_INPUTS[name].parse(input);
  return {
    kind: 'read-result',
    toolName: name,
    data: readToolPayloadSchema.parse(await runtime.read(name, parsed)),
  };
};

export const executeProposalTool = (
  name: ProposalToolName,
  input: unknown,
  context: TurnChatContext,
  exactSourceText: string,
  createId?: () => string,
): IntelligenceToolResult => {
  const parsed = proposalInputSchema.parse(input);
  return {
    kind: 'proposal',
    toolName: name,
    proposal: createPendingProposal({
      id: createId?.(),
      toolName: name,
      title: parsed.title,
      exactSourceText,
      editableDraft: parsed.editableDraft,
      evidenceSourceIds: parsed.evidenceSourceIds,
      context,
    }),
  };
};

export const isProposalToolResult = (value: unknown): value is Extract<IntelligenceToolResult, { kind: 'proposal' }> => {
  if (!value || typeof value !== 'object') return false;
  return (value as { kind?: unknown }).kind === 'proposal';
};

export const createUnavailableReadRuntime = (): ReadToolRuntime => ({
  async read(name) {
    return {
      available: false,
      data: { toolName: name },
      sourceIds: [],
      synthetic: false,
      authorization: 'none',
      reason: 'The host field repository has not been integrated with Track C.',
    };
  },
});
