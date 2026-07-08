import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const viteEnv = import.meta.env ?? {};
const supabaseUrl = viteEnv.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = viteEnv.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSyncFeatureEnabled = viteEnv.VITE_ENABLE_SYNC === 'true';

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('your-project-ref') &&
    !supabaseAnonKey.includes('your-anon-public-key'),
);

let client: SupabaseClient | null = null;

export const getSupabaseClient = () => {
  if (!isSyncFeatureEnabled || !isSupabaseConfigured) {
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
