import { json } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Lightweight connectivity probe. board-data.js calls GET /api/board-info?id=test
// (checkOnline) and treats any non-zero HTTP status as "online". Kept local so the
// probe is instant and reflects reachability of THIS server (offline => fetch fails).
export async function GET() {
  return json(
    { ok: true, ts: Date.now() },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } },
  );
}
