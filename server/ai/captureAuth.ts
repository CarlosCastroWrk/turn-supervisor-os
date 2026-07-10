import { z } from 'zod';
import { CaptureRouteError, type CaptureUser } from './captureHandler.js';

const authUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
}).passthrough();

interface CaptureAuthOptions {
  env?: NodeJS.ProcessEnv;
  fetcher?: typeof fetch;
}

const configuredSupabaseUrl = (env: NodeJS.ProcessEnv) => env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const configuredSupabaseAnonKey = (env: NodeJS.ProcessEnv) =>
  env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;

const safeSupabaseUrl = (value: string) => {
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !local) {
    throw new Error('Supabase URL must use HTTPS.');
  }
  return url;
};

export const verifyCaptureUser = async (
  token: string,
  options: CaptureAuthOptions = {},
): Promise<CaptureUser> => {
  const env = options.env ?? process.env;
  const supabaseUrl = configuredSupabaseUrl(env);
  const anonKey = configuredSupabaseAnonKey(env);
  const allowedEmail = env.TURN_OS_ALLOWED_EMAIL?.trim().toLowerCase();
  if (!supabaseUrl || !anonKey || !allowedEmail) {
    throw new CaptureRouteError(503, 'SERVER_CONFIG', 'Secure AI assist is not configured.');
  }

  let authEndpoint: URL;
  try {
    authEndpoint = new URL('/auth/v1/user', safeSupabaseUrl(supabaseUrl));
  } catch {
    throw new CaptureRouteError(503, 'SERVER_CONFIG', 'Secure AI assist is not configured.');
  }

  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)(authEndpoint, {
      method: 'GET',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new CaptureRouteError(503, 'AUTH_UNAVAILABLE', 'Sign-in verification is temporarily unavailable.');
  }

  if (!response.ok) {
    throw new CaptureRouteError(401, 'UNAUTHORIZED', 'Sign in to use secure AI assist.');
  }

  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    throw new CaptureRouteError(401, 'UNAUTHORIZED', 'Sign in to use secure AI assist.');
  }
  const parsedUser = authUserSchema.safeParse(responseBody);
  if (!parsedUser.success) {
    throw new CaptureRouteError(401, 'UNAUTHORIZED', 'Sign in to use secure AI assist.');
  }
  if (parsedUser.data.email.trim().toLowerCase() !== allowedEmail) {
    throw new CaptureRouteError(403, 'FORBIDDEN', 'This account is not allowed to use secure AI assist.');
  }

  return { id: parsedUser.data.id, email: parsedUser.data.email };
};
