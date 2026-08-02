import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

// Shared pieces for the read-only property portal (Joseph & Paige).
// The snapshot deliberately carries ONLY unit-grain work status — no pay,
// no pricing, no phone numbers, no notes.

export const PORTAL_SNAPSHOT_ID = 'current';

const tradeStatusSchema = z.enum([
  'none',
  'open',
  'working',
  'crew-done',
  'passed',
  'approved',
]);

export const portalSnapshotSchema = z.object({
  propertyName: z.string().min(1).max(120),
  generatedAt: z.string().min(10).max(40),
  units: z
    .array(
      z.object({
        n: z.string().min(1).max(12),
        b: z.string().max(24).optional(),
        p: tradeStatusSchema,
        c: tradeStatusSchema,
        cb: z.boolean().optional(),
        partial: z.boolean().optional(),
      }),
    )
    .max(500),
});

export type PortalSnapshot = z.infer<typeof portalSnapshotSchema>;

export const portalTokenMatches = (candidate: string | null | undefined) => {
  const expected = process.env.TURN_OS_PORTAL_TOKEN?.trim();
  if (!expected || !candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
};

const supabaseRestUrl = () => {
  const base = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!base) return undefined;
  return `${base.replace(/\/$/, '')}/rest/v1/portal_snapshots`;
};

const serviceKey = () =>
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  || process.env.SUPABASE_SECRET_KEY?.trim();

export const portalStoreConfigured = () =>
  Boolean(supabaseRestUrl() && serviceKey());

export const writePortalSnapshot = async (payload: PortalSnapshot) => {
  const url = supabaseRestUrl();
  const key = serviceKey();
  if (!url || !key) throw new Error('portal-store-unconfigured');
  const response = await fetch(url, {
    body: JSON.stringify({
      id: PORTAL_SNAPSHOT_ID,
      payload,
      updated_at: new Date().toISOString(),
    }),
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      prefer: 'resolution=merge-duplicates',
    },
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error(`portal-store-write-${response.status}`);
  }
};

export const readPortalSnapshot = async (): Promise<
  { payload: PortalSnapshot; updatedAt: string } | undefined
> => {
  const url = supabaseRestUrl();
  const key = serviceKey();
  if (!url || !key) throw new Error('portal-store-unconfigured');
  const response = await fetch(
    `${url}?id=eq.${PORTAL_SNAPSHOT_ID}&select=payload,updated_at&limit=1`,
    {
      headers: { apikey: key, authorization: `Bearer ${key}` },
    },
  );
  if (!response.ok) {
    throw new Error(`portal-store-read-${response.status}`);
  }
  const rows = await response.json() as { payload: PortalSnapshot; updated_at: string }[];
  const row = rows[0];
  if (!row) return undefined;
  return { payload: row.payload, updatedAt: row.updated_at };
};
