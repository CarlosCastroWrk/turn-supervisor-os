import {
  COMPLEX_MODEL_ID,
  ROUTINE_MODEL_ID,
  routeDecisionSchema,
  type IntelligenceTask,
  type RouteDecision,
  type TurnIntelligenceRequest,
} from './contracts';

const noModelTasks = new Set<IntelligenceTask>([
  'count',
  'progress',
  'filter',
  'status_lookup',
  'safety_check',
]);

const complexTasks = new Set<IntelligenceTask>([
  'difficult_visual',
  'conflict_analysis',
  'long_ambiguous',
  'low_confidence',
  'deep_analysis',
]);

const latestUserText = (request: TurnIntelligenceRequest) =>
  [...request.messages].reverse().find((message) => message.role === 'user')?.content ?? '';

const inferAutoTask = (request: TurnIntelligenceRequest): IntelligenceTask => {
  const text = latestUserText(request).trim();
  const normalized = text.toLowerCase();
  if (/^(how many|count|show|which)\b/.test(normalized) &&
      /\b(unit|room|callback|blocker|ready|paint|clean)s?\b/.test(normalized)) {
    return 'filter';
  }
  if (/\b(safety|do not enter|renewal|occupied|allowed work window)\b/.test(normalized)) {
    return 'safety_check';
  }
  if (/\b(spanish|español|translate|draft a message)\b/.test(normalized)) return 'spanish_draft';
  if (/\b(summarize|summary|recap)\b/.test(normalized)) return 'summarize';
  if (request.attachments.some((attachment) => attachment.kind === 'image')) {
    return /\b(conflict|unclear|hard to read|contradiction)\b/.test(normalized)
      ? 'difficult_visual'
      : 'normal_visual';
  }
  if (text.length > 2_800 || /\b(deep analysis|resolve conflicts|ambiguous evidence)\b/.test(normalized)) {
    return 'deep_analysis';
  }
  return 'general_chat';
};

export const routeTurnIntelligence = (request: TurnIntelligenceRequest): RouteDecision => {
  const task = request.task === 'auto' ? inferAutoTask(request) : request.task;
  if (noModelTasks.has(task)) {
    return routeDecisionSchema.parse({
      tier: 'no-model',
      task,
      modelId: null,
      reason: 'Deterministic field data or a fixed safety rule can answer without a model.',
      deterministic: true,
    });
  }
  if (complexTasks.has(task)) {
    return routeDecisionSchema.parse({
      tier: 'complex',
      task,
      modelId: COMPLEX_MODEL_ID,
      reason: 'The request needs deeper ambiguity, conflict, or visual reasoning.',
      deterministic: false,
    });
  }
  return routeDecisionSchema.parse({
    tier: 'routine',
    task,
    modelId: ROUTINE_MODEL_ID,
    reason: 'The request fits routine chat, drafting, summarization, or structured assistance.',
    deterministic: false,
  });
};

export interface DeterministicTurnRuntime {
  answer(task: IntelligenceTask, request: TurnIntelligenceRequest): Promise<{
    text: string;
    sources: TurnIntelligenceRequest['sources'];
  }>;
}

export const createDisabledDeterministicRuntime = (): DeterministicTurnRuntime => ({
  async answer(task) {
    if (task === 'safety_check') {
      return {
        text: 'Use the official paper assignment and confirmed restrictions. Do not enter an unassigned, renewal, or occupied room without explicit authorization.',
        sources: [],
      };
    }
    throw new Error('Deterministic field records are not connected in this Track C preview.');
  },
});
