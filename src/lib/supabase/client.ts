import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const viteEnv = import.meta.env ?? {};
const supabaseUrl = viteEnv.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = viteEnv.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSyncFeatureEnabled = viteEnv.VITE_ENABLE_SYNC === 'true';

// AI features (photo/message import, secure Capture) need a signed-in Supabase
// session even when the full sync engine is off. The engine itself stays gated
// by isSyncFeatureEnabled everywhere in sync.ts; this flag only lets the auth
// client exist so a user can sign in for those features without turning on sync
// (which would put a login wall on the otherwise-public field app).
export const isAuthNeedingFeatureEnabled =
  isSyncFeatureEnabled ||
  viteEnv.VITE_ENABLE_INTAKE === 'true' ||
  viteEnv.VITE_ENABLE_AI === 'true';

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('your-project-ref') &&
    !supabaseAnonKey.includes('your-anon-public-key'),
);

let client: SupabaseClient | null = null;

export const createSessionBoundSupabaseClient = (
  url: string,
  anonKey: string,
  accessToken: string,
  customFetch?: typeof fetch,
) => createClient(url, anonKey, {
  accessToken: async () => accessToken,
  ...(customFetch ? { global: { fetch: customFetch } } : {}),
});

export const getSessionBoundSupabaseClient = (accessToken: string) => {
  if (!isSupabaseConfigured) {
    return null;
  }

  return createSessionBoundSupabaseClient(
    supabaseUrl as string,
    supabaseAnonKey as string,
    accessToken,
  );
};

export const getSupabaseClient = () => {
  if (!isAuthNeedingFeatureEnabled || !isSupabaseConfigured) {
    return null;
  }

  if (!client) {
    client = createClient(supabaseUrl as string, supabaseAnonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      realtime: {
        params: {
          eventsPerSecond: 4,
        },
      },
    });
  }

  return client;
};
