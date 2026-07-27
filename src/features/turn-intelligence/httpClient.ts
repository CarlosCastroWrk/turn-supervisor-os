import {
  intelligenceStreamEventSchema,
  type TurnIntelligenceClient,
} from './contracts';

interface HttpTurnIntelligenceClientOptions {
  endpoint?: string;
  getAccessToken(): Promise<string | null>;
  fetcher?: typeof fetch;
}

export const createHttpTurnIntelligenceClient = (
  options: HttpTurnIntelligenceClientOptions,
): TurnIntelligenceClient => ({
  async *stream(request, signal) {
    const token = await options.getAccessToken();
    if (!token) {
      yield {
        type: 'error',
        code: 'DISABLED',
        message: 'Sign in is required before Turn Chat can use a server provider.',
        retryable: false,
      };
      yield { type: 'done', cancelled: false };
      return;
    }
    const response = await (options.fetcher ?? fetch)(options.endpoint ?? '/api/intelligence/chat', {
      method: 'POST',
      headers: {
        Accept: 'application/x-ndjson',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      cache: 'no-store',
      credentials: 'same-origin',
      redirect: 'error',
      signal,
    });
    if (!response.ok || !response.body) {
      yield {
        type: 'error',
        code: 'UNAVAILABLE',
        message: 'Turn Chat could not start. No proposal or record was applied.',
        retryable: response.status >= 500,
      };
      yield { type: 'done', cancelled: signal?.aborted ?? false };
      return;
    }

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let pending = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        pending += value ?? '';
        const lines = pending.split('\n');
        pending = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          yield intelligenceStreamEventSchema.parse(JSON.parse(line));
        }
        if (done) break;
      }
      if (pending.trim()) yield intelligenceStreamEventSchema.parse(JSON.parse(pending));
    } finally {
      reader.releaseLock();
    }
  },
});
