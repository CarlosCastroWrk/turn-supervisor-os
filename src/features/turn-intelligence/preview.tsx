import { createRoot } from 'react-dom/client';
import type { TurnChatContext, TurnChatMessage } from './contracts';
import { createMockIntelligenceProvider } from './mockProvider';
import { createTurnIntelligenceService } from './service';
import { TurnChatPanel } from './TurnChatPanel';
import './preview.css';

const contexts: TurnChatContext[] = [
  { kind: 'property', propertyId: 'synthetic-moon-tower', propertyName: 'Synthetic Moon Tower', synthetic: true },
  { kind: 'unit', propertyId: 'synthetic-moon-tower', propertyName: 'Synthetic Moon Tower', unitId: 'synthetic-413', unitNumber: '413', synthetic: true },
  { kind: 'trade-section', propertyId: 'synthetic-moon-tower', propertyName: 'Synthetic Moon Tower', unitId: 'synthetic-413', unitNumber: '413', trade: 'paint', section: 'A', synthetic: true },
  { kind: 'general', synthetic: true },
];

const initialMessages: TurnChatMessage[] = [{
  id: 'synthetic-welcome',
  role: 'assistant',
  content: 'This is a synthetic Track C preview. I can demonstrate streaming, routing, and proposal review without a real model or field records.',
  createdAt: '2026-07-27T14:00:00.000Z',
  sourceIds: [],
}];

const client = createTurnIntelligenceService({ provider: createMockIntelligenceProvider() });

createRoot(document.getElementById('root')!).render(
  <TurnChatPanel
    client={client}
    contexts={contexts}
    initialMessages={initialMessages}
    providerState="mock"
  />,
);
