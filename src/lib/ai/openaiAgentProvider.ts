import type { AppData } from '../../types';
import { getSupabaseClient } from '../supabase/client';
import {
  buildModelCaptureRequest,
  mergeModelAndDeterministicCapture,
  modelCaptureApiResponseSchema,
} from './modelCapture';
import { mockAgentProvider } from './mockAgentProvider';
import type { AgentParseResult, AgentProvider } from './types';

const viteEnv = import.meta.env ?? {};
const AI_REQUEST_TIMEOUT_MS = 20_000;

interface OpenAiAgentProviderDependencies {
  enabled: boolean;
  fetcher: typeof fetch;
  getAccessToken: () => Promise<string | null>;
  isOnline: () => boolean;
}

const defaultDependencies: OpenAiAgentProviderDependencies = {
  enabled: viteEnv.VITE_ENABLE_AI === 'true',
  fetcher: (...args) => fetch(...args),
  async getAccessToken() {
    const client = getSupabaseClient();
    if (!client) return null;
    const { data, error } = await client.auth.getSession();
    return error ? null : data.session?.access_token ?? null;
  },
  isOnline: () => typeof navigator === 'undefined' || navigator.onLine,
};

const localResultWithNotice = (result: AgentParseResult, providerNotice: string): AgentParseResult => ({
  ...result,
  provider: 'deterministic',
  providerNotice,
});

export const createOpenAiAgentProvider = (
  overrides: Partial<OpenAiAgentProviderDependencies> = {},
): AgentProvider => {
  const dependencies = { ...defaultDependencies, ...overrides };

  return {
    async parseQuickCapture(input: string, data: AppData) {
      const deterministicResult = await mockAgentProvider.parseQuickCapture(input, data);
      if (!dependencies.enabled) return deterministicResult;
      if (!input.trim()) return deterministicResult;
      const activeProject = data.projects.find((project) => project.id === data.activeProjectId);
      if (activeProject?.mode !== 'real') {
        return localResultWithNotice(
          deterministicResult,
          'Demo Mode used the local safety parser and did not spend AI credit.',
        );
      }
      if (!dependencies.isOnline()) {
        return localResultWithNotice(deterministicResult, 'Offline safety parser used. No capture was lost.');
      }

      let accessToken: string | null;
      try {
        accessToken = await dependencies.getAccessToken();
      } catch {
        return localResultWithNotice(
          deterministicResult,
          'Secure AI assist could not verify sign-in. The local safety parser was used.',
        );
      }
      if (!accessToken) {
        return localResultWithNotice(
          deterministicResult,
          'Secure AI assist needs Sync sign-in. The local safety parser was used.',
        );
      }

      const controller = new AbortController();
      const timeoutId = globalThis.setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);

      try {
        const request = buildModelCaptureRequest(input, data);
        const response = await dependencies.fetcher('/api/agent/capture', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
          cache: 'no-store',
          credentials: 'same-origin',
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Capture assist returned ${response.status}.`);
        }

        const apiResponse = modelCaptureApiResponseSchema.parse(await response.json());
        if (apiResponse.result.rawInput !== request.input) {
          throw new Error('Capture assist response did not match the submitted note.');
        }
        const meteredResult: AgentParseResult = {
          ...apiResponse.result,
          usage: apiResponse.result.usage
            ? { ...apiResponse.result.usage, requestId: apiResponse.requestId }
            : undefined,
        };
        return mergeModelAndDeterministicCapture(meteredResult, deterministicResult);
      } catch {
        return localResultWithNotice(
          deterministicResult,
          'Secure AI assist was unavailable. The local safety parser completed this capture.',
        );
      } finally {
        globalThis.clearTimeout(timeoutId);
      }
    },
    askOs: (question, data) => mockAgentProvider.askOs(question, data),
    generateBriefing: (type, data) => mockAgentProvider.generateBriefing(type, data),
  };
};

export const openaiAgentProvider = createOpenAiAgentProvider();
