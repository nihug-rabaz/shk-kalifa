import { NextRequest } from 'next/server';
import { queryOne } from '@/lib/db';
import { isUuid } from '@/lib/ids';
import { requireAdmin, json, badRequest, notFound, serverError } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/screens/:id/claim { groupId, name? } — bind a screen to a group (admin).
// Upserts the screen row so an admin can claim even before the screen has registered.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireAdmin();
  if (gate instanceof Response) return gate;
  const id = params.id;
  if (!isUuid(id)) return badRequest('bad screen id');
  try {
    const body = await req.json().catch(() => null);
    const groupId = Number(body?.groupId);
    if (!Number.isInteger(groupId) || groupId <= 0) return badRequest('groupId required');
    const name = body?.name ? String(body.name).slice(0, 120) : null;

    const group = await queryOne('select id from groups where id = $1', [groupId]);
    if (!group) return notFound('group not found');

    const screen = await queryOne(
      `insert into screens (id, name, group_id, paired, paired_at, last_seen_at)
       values ($1, $2, $3, true, now(), now())
       on conflict (id) do update set
         group_id = excluded.group_id,
         paired = true,
         paired_at = now(),
         name = coalesce(excluded.name, screens.name)
       returning id, name, group_id, paired`,
      [id, name, groupId],
    );
    return json({ ok: true, screen });
  } catch (e) {
    console.error('[screens/:id/claim]', e);
    return serverError();
  }
}
