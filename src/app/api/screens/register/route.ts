import { NextRequest } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { isUuid } from '@/lib/ids';
import { json, badRequest, serverError } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/screens/register — a screen announces itself on boot (public).
// The screen mints its own uuid (crypto.randomUUID) and stores it locally.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const id = body?.id;
    if (!isUuid(id)) return badRequest('valid uuid id required');

    const name = body?.name ? String(body.name).slice(0, 120) : null;
    const ua = (req.headers.get('user-agent') || '').slice(0, 300) || null;
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null;

    const existing = await queryOne('select id, paired, group_id from screens where id = $1', [id]);
    if (existing) {
      await query(
        `update screens set last_seen_at = now(),
           user_agent = coalesce($2, user_agent),
           ip = coalesce($3, ip),
           name = coalesce($4, name)
         where id = $1`,
        [id, ua, ip, name],
      );
      return json({
        id,
        paired: existing.paired && !!existing.group_id,
        groupId: existing.group_id,
      });
    }

    await query(
      `insert into screens (id, name, user_agent, ip, last_seen_at)
       values ($1, $2, $3, $4, now())`,
      [id, name, ua, ip],
    );
    return json({ id, paired: false, groupId: null }, { status: 201 });
  } catch (e) {
    console.error('[screens/register]', e);
    return serverError();
  }
}
