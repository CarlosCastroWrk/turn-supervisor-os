import { ZodError } from 'zod';
import {
  modelCaptureApiResponseSchema,
  modelCaptureRequestSchema,
  type ModelCaptureRequest,
} from '../../src/lib/ai/modelCapture.js';
import type { AgentParseResult } from '../../src/lib/ai/types.js';

const MAX_REQUEST_BYTES = 64_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS = 12;

export interface CaptureUser {
  id: string;
  email: string;
}

export class CaptureRouteError extends Error {
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
    this.name = 'CaptureRouteError';
    this.status = status;
    this.code = code;
    this.publicMessage = publicMessage;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

interface CaptureHandlerDependencies {
  authenticate: (token: string) => Promise<CaptureUser>;
  parseModel: (request: ModelCaptureRequest, user: CaptureUser) => Promise<AgentParseResult>;
  consumeRateLimit?: (userId: string) => { allowed: boolean; retryAfterSeconds: number };
  createRequestId?: () => string;
}

const requestWindows = new Map<string, number[]>();

export const consumeCaptureRateLimit = (userId: string) => {
  const now = Date.now();
  const active = (requestWindows.get(userId) ?? []).filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);
  if (active.length >= RATE_LIMIT_REQUESTS) {
    const retryAfterSeconds = Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS - (now - active[0])) / 1_000));
    requestWindows.set(userId, active);
    return { allowed: false, retryAfterSeconds };
  }
  requestWindows.set(userId, [...active, now]);
  return { allowed: true, retryAfterSeconds: 0 };
};

const responseHeaders = (extra: HeadersInit = {}) => ({
  'Cache-Control': 'no-store, max-age=0',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
  Vary: 'Authorization',
  ...Object.fromEntries(new Headers(extra).entries()),
});

const jsonResponse = (body: unknown, status: number, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers: responseHeaders(headers) });

const bearerTokenFrom = (request: Request) => {
  const authorization = request.headers.get('authorization') ?? '';
  const match = authorization.match(/^Bearer\s+([A-Za-z0-9._~-]{16,8192})$/);
  if (!match) {
    throw new CaptureRouteError(401, 'UNAUTHORIZED', 'Sign in to use secure AI assist.');
  }
  return match[1];
};

const validateOrigin = (request: Request) => {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    throw new CaptureRouteError(403, 'CROSS_ORIGIN_BLOCKED', 'This request is not allowed.');
  }
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && !['same-origin', 'none'].includes(fetchSite)) {
    throw new CaptureRouteError(403, 'CROSS_ORIGIN_BLOCKED', 'This request is not allowed.');
  }
};

const readRequest = async (request: Request) => {
  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    throw new CaptureRouteError(413, 'REQUEST_TOO_LARGE', 'Capture is too large for AI assist.');
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_REQUEST_BYTES) {
    throw new CaptureRouteError(413, 'REQUEST_TOO_LARGE', 'Capture is too large for AI assist.');
  }
  try {
    return modelCaptureRequestSchema.parse(JSON.parse(body));
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) {
      throw new CaptureRouteError(400, 'INVALID_REQUEST', 'Capture context is invalid.');
    }
    throw error;
  }
};

const errorName = (error: unknown) => (error instanceof Error ? error.name : 'UnknownError');

export const createCaptureHandler = (dependencies: CaptureHandlerDependencies) => async (request: Request) => {
  const requestId = dependencies.createRequestId?.() ?? crypto.randomUUID();

  try {
    if (request.method !== 'POST') {
      throw new CaptureRouteError(405, 'METHOD_NOT_ALLOWED', 'Only POST requests are allowed.');
    }
    validateOrigin(request);
    if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
      throw new CaptureRouteError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send capture context as JSON.');
    }

    const user = await dependencies.authenticate(bearerTokenFrom(request));
    const captureRequest = await readRequest(request);
    const rateLimit = (dependencies.consumeRateLimit ?? consumeCaptureRateLimit)(user.id);
    if (!rateLimit.allowed) {
      throw new CaptureRouteError(
        429,
        'RATE_LIMITED',
        'Secure AI assist is busy. Try again shortly.',
        rateLimit.retryAfterSeconds,
      );
    }

    const result = await dependencies.parseModel(captureRequest, user);
    const response = modelCaptureApiResponseSchema.parse({ requestId, result });
    return jsonResponse(response, 200);
  } catch (error) {
    if (error instanceof CaptureRouteError) {
      const headers: HeadersInit = {};
      if (error.status === 405) headers.Allow = 'POST';
      if (error.retryAfterSeconds) headers['Retry-After'] = String(error.retryAfterSeconds);
      return jsonResponse(
        { requestId, error: { code: error.code, message: error.publicMessage } },
        error.status,
        headers,
      );
    }

    console.error('capture_model_route_failed', { requestId, error: errorName(error) });
    return jsonResponse(
      { requestId, error: { code: 'MODEL_UNAVAILABLE', message: 'Secure AI assist is unavailable.' } },
      503,
    );
  }
};
