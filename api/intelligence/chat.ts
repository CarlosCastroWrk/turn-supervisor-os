import { verifyCaptureUser } from '../../server/ai/captureAuth.js';
import { createMockIntelligenceProvider } from '../../src/features/turn-intelligence/mockProvider.js';
import { createUnavailableProvider } from '../../src/features/turn-intelligence/provider.js';
import { createTurnIntelligenceService } from '../../src/features/turn-intelligence/service.js';
import { createUnavailableReadRuntime } from '../../src/features/turn-intelligence/tools.js';
import { createGatewayIntelligenceProvider } from './gatewayProvider.js';
import { createIntelligenceHandler } from './handler.js';

const providerMode = () => process.env.TURN_OS_INTELLIGENCE_PROVIDER?.trim().toLowerCase() ?? 'mock';

const createProvider = () => {
  const mode = providerMode();
  if (mode === 'mock') return createMockIntelligenceProvider();
  if (mode === 'gateway') {
    return createGatewayIntelligenceProvider({
      configured: Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN),
      readRuntime: createUnavailableReadRuntime(),
    });
  }
  return createUnavailableProvider('Turn Chat is disabled because its provider mode is unavailable.');
};

const handleIntelligenceRequest = createIntelligenceHandler({
  authenticate: verifyCaptureUser,
  createClient: () => createTurnIntelligenceService({ provider: createProvider() }),
});

export default {
  fetch: handleIntelligenceRequest,
};
