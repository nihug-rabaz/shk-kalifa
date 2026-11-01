import 'server-only';
import { Pool, type QueryResultRow } from 'pg';

// Single shared pool. On dev hot-reload we stash it on globalThis so we don't
// leak pools. Works both self-hosted (next start) and on Vercel with the Neon
// pooler endpoint (the DATABASE_URL provided already targets `-pooler`).
const globalForDb = globalThis as unknown as { __pgPool?: Pool };

/** A database on this machine (development) speaks plain TCP; everything else is remote
    and must be encrypted. Without this, `postgres://…@localhost` fails the handshake. */
export function sslFor(connectionString: string): { rejectUnauthorized: true } | false {
  try {
    const host = new URL(connectionString).hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return false;
  } catch {
    /* not a URL we can parse — treat it as remote and keep TLS on */
  }
  return { rejectUnauthorized: true };
}

function makePool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Add it to .env.local');
  }
  return new Pool({
    connectionString,
    // Neon requires TLS; its certs are valid so we keep verification on.
    ssl: sslFor(connectionString),
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

// Created on FIRST USE, not at import time: `next build` imports every route
// module to collect page data, so building the pool eagerly made the whole build
// fail with "DATABASE_URL is not set" in any environment that has no database
// URL at build time (e.g. Vercel preview builds). Nothing here queries at build
// time — a missing URL still throws on the first real query.
let poolRef: Pool | undefined;

export function getPool(): Pool {
  if (poolRef) return poolRef;
  poolRef = globalForDb.__pgPool ?? makePool();
  if (process.env.NODE_ENV !== 'production') globalForDb.__pgPool = poolRef;
  return poolRef;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await getPool().query<T>(text, params as never[]);
  return res.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
