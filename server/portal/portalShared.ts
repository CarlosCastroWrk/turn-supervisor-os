import { timingSafeEqual } from 'node:crypto';
import pg from 'pg';
import { z } from 'zod';

// Shared pieces for the read-only property portal (Joseph & Paige).
// The snapshot deliberately carries ONLY unit-grain work status — no pay,
// no pricing, no phone numbers, no notes. Storage is a single row in
// portal_snapshots, reached over the direct Postgres connection (RLS on the
// table has zero policies, so PostgREST callers can never touch it).

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

const connectionString = () =>
  process.env.POSTGRES_URL_NON_POOLING?.trim() || process.env.POSTGRES_URL?.trim();

export const portalStoreConfigured = () => Boolean(connectionString());

export const withPortalDb = async <T>(
  run: (client: pg.Client) => Promise<T>,
): Promise<T> => {
  const cs = connectionString();
  if (!cs) throw new Error('portal-store-unconfigured');
  const local = /localhost|127\.0\.0\.1/.test(cs);
  const client = new pg.Client({
    connectionString: cs,
    // Supabase serves a provider-signed chain that Node's default CA set
    // rejects; encryption still applies.
    ssl: local ? undefined : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end().catch(() => undefined);
  }
};

export const writePortalSnapshot = async (payload: PortalSnapshot) =>
  withPortalDb(async (client) => {
    await client.query(
      `insert into public.portal_snapshots (id, payload, updated_at)
       values ($1, $2::jsonb, now())
       on conflict (id) do update
         set payload = excluded.payload, updated_at = now()`,
      [PORTAL_SNAPSHOT_ID, JSON.stringify(payload)],
    );
  });

export const readPortalSnapshot = async (): Promise<
  { payload: PortalSnapshot; updatedAt: string } | undefined
> =>
  withPortalDb(async (client) => {
    const result = await client.query<{ payload: PortalSnapshot; updated_at: string }>(
      'select payload, updated_at from public.portal_snapshots where id = $1 limit 1',
      [PORTAL_SNAPSHOT_ID],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return { payload: row.payload, updatedAt: new Date(row.updated_at).toISOString() };
  });
