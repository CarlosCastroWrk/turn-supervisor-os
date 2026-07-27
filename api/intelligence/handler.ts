import { ZodError } from 'zod';
import {
  intelligenceStreamEventSchema,
  turnIntelligenceRequestSchema,
  type TurnIntelligenceClient,
} from '../../src/features/turn-intelligence/contracts.js';

const MAX_REQUEST_BYTES = 96_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS = 20;

export interface IntelligenceUser {
  id: string;
  email: string;
}

export class IntelligenceRouteError extends Error {
  readonly status: number;
  readonly code: string;
  readonly publicMessage: string;
  readonly retryAfterSeconds?: number;

  constructor(
    status: number,
    code: string,
    publicMessage: string,
    retryAfterSeconds?: number,
  ) {
    super(publicMessage);
    this.name = 'IntelligenceRouteError';
    this.status = status;
    this.code = code;
    this.publicMessage = publicMessage;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

interface IntelligenceHandlerOptions {
  authenticate(token: string): Promise<IntelligenceUser>;
  createClient(user: IntelligenceUser): TurnIntelligenceClient;
  consumeRateLimit?: (userId: string) => { allowed: boolean; retryAfterSeconds: number };
  createRequestId?: () => string;
}

const requestWindows = new Map<string, number[]>();

export const consumeIntelligenceRateLimit = (userId: string) => {
  const now = Date.now();
  const active = (requestWindows.get(userId) ?? []).filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);
  if (active.length >= RATE_LIMIT_REQUESTS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS - (now - active[0])) / 1_000)),
    };
  }
  requestWindows.set(userId, [...active, now]);
  return { allowed: true, retryAfterSeconds: 0 };
};

const secureHeaders = (contentType: string, extra: HeadersInit = {}) => ({
  'Cache-Control': 'no-store, max-age=0',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Content-Type': contentType,
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  Vary: 'Authorization',
  ...Object.fromEntries(new Headers(extra).entries()),
});

const jsonResponse = (body: unknown, status: number, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), {
    status,
    headers: secureHeaders('application/json; charset=utf-8', headers),
  });

const validateOrigin = (request: Request) => {
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get('origin');
  if (origin && origin !== requestOrigin) {
    throw new IntelligenceRouteError(403, 'CROSS_ORIGIN_BLOCKED', 'This request is not allowed.');
  }
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && !['same-origin', 'none'].includes(fetchSite)) {
    throw new IntelligenceRouteError(403, 'CROSS_ORIGIN_BLOCKED', 'This request is not allowed.');
  }
};

const bearerToken = (request: Request) => {
  const match = (request.headers.get('authorization') ?? '')
    .match(/^Bearer\s+([A-Za-z0-9._~-]{16,8192})$/);
  if (!match) throw new IntelligenceRouteError(401, 'UNAUTHORIZED', 'Sign in to use Turn Chat.');
  return match[1];
};

const readInput = async (request: Request) => {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) {
    throw new IntelligenceRouteError(413, 'REQUEST_TOO_LARGE', 'Turn Chat input is too large.');
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_REQUEST_BYTES) {
    throw new IntelligenceRouteError(413, 'REQUEST_TOO_LARGE', 'Turn Chat input is too large.');
  }
  try {
    return turnIntelligenceRequestSchema.parse(JSON.parse(body));
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) {
      throw new IntelligenceRouteError(400, 'INVALID_REQUEST', 'Turn Chat input is invalid.');
    }
    throw error;
  }
};

export const createIntelligenceHandler = (options: IntelligenceHandlerOptions) => async (request: Request) => {
  const requestId = options.createRequestId?.() ?? crypto.randomUUID();
  try {
    if (request.method !== 'POST') {
      throw new IntelligenceRouteError(405, 'METHOD_NOT_ALLOWED', 'Only POST requests are allowed.');
    }
    validateOrigin(request);
    if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
      throw new IntelligenceRouteError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send Turn Chat input as JSON.');
    }
    const user = await options.authenticate(bearerToken(request));
    const input = await readInput(request);
    const limit = (options.consumeRateLimit ?? consumeIntelligenceRateLimit)(user.id);
    if (!limit.allowed) {
      throw new IntelligenceRouteError(429, 'RATE_LIMITED', 'Turn Chat is busy. Try again shortly.', limit.retryAfterSeconds);
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of options.createClient(user).stream(input, request.signal)) {
            const safeEvent = intelligenceStreamEventSchema.parse(event);
            controller.enqueue(encoder.encode(`${JSON.stringify(safeEvent)}\n`));
          }
        } catch {
          const code = request.signal.aborted ? 'CANCELLED' : 'UNAVAILABLE';
          controller.enqueue(encoder.encode(`${JSON.stringify({
            type: 'error',
            code,
            message: request.signal.aborted
              ? 'Turn Chat was cancelled.'
              : 'Turn Chat is unavailable. No proposal or record was applied.',
            retryable: true,
          })}\n`));
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      status: 200,
      headers: secureHeaders('application/x-ndjson; charset=utf-8', {
        'X-Turn-Request-Id': requestId,
      }),
    });
  } catch (error) {
    if (error instanceof IntelligenceRouteError) {
      const headers: HeadersInit = {};
      if (error.status === 405) headers.Allow = 'POST';
      if (error.retryAfterSeconds) headers['Retry-After'] = String(error.retryAfterSeconds);
      return jsonResponse({ requestId, error: { code: error.code, message: error.publicMessage } }, error.status, headers);
    }
    return jsonResponse({
      requestId,
      error: { code: 'UNAVAILABLE', message: 'Turn Chat is unavailable. No proposal or record was applied.' },
    }, 503);
  }
};
