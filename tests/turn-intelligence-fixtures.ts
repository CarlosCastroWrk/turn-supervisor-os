import type {
  TurnChatContext,
  TurnChatMessage,
  TurnIntelligenceRequest,
} from '../src/features/turn-intelligence/contracts.ts';

export const syntheticContext: TurnChatContext = {
  kind: 'unit',
  propertyId: 'synthetic-property',
  propertyName: 'Synthetic Moon Tower',
  unitId: 'synthetic-unit-413',
  unitNumber: '413',
  synthetic: true,
};

export const userMessage = (content: string): TurnChatMessage => ({
  id: 'message-user',
  role: 'user',
  content,
  createdAt: '2026-07-27T14:00:00.000Z',
  sourceIds: [],
});

export const syntheticRequest = (
  content = 'Help me with this synthetic field question.',
  overrides: Partial<TurnIntelligenceRequest> = {},
): TurnIntelligenceRequest => ({
  requestId: 'request-synthetic',
  task: 'auto',
  context: syntheticContext,
  messages: [userMessage(content)],
  attachments: [],
  sources: [],
  ...overrides,
});
