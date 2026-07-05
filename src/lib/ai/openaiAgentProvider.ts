import type { AgentProvider } from './types';

export const openaiAgentProvider: AgentProvider = {
  async parseQuickCapture() {
    throw new Error('OpenAI provider is not enabled in this static Vite app. Add a server-side API route first.');
  },
  async askOs() {
    throw new Error('OpenAI provider is not enabled in this static Vite app. Add a server-side API route first.');
  },
  async generateBriefing() {
    throw new Error('OpenAI provider is not enabled in this static Vite app. Add a server-side API route first.');
  },
};

