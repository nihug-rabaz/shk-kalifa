import { NextRequest } from 'next/server';
import { queryOne } from '@/lib/db';
import { isUuid } from '@/lib/ids';
import { requireAdmin, json, badRequest, notFound, serverError } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PUT /api/screens/:id — rename / reassign group / unpair (admin)
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireAdmin();
  if (gate instanceof Response) return gate;
  const id = params.id;
  if (!isUuid(id)) return badRequest('bad id');
  try {
    const body = await req.json().catch(() => null);
    if (!body) return badRequest('invalid body');

    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (body.name !== undefined) {
      sets.push(`name = $${i++}`);
      vals.push(body.name ? String(body.name).slice(0, 120) : null);
    }
    if (body.groupId !== undefined) {
      if (body.groupId === null) {
        sets.push(`group_id = null`);
        sets.push(`paired = false`);
      } else {
        const gid = Number(body.groupId);
        if (!Number.isInteger(gid) || gid <= 0) return badRequest('bad groupId');
        const g = await queryOne('select id from groups where id = $1', [gid]);
        if (!g) return notFound('group not found');
        sets.push(`group_id = $${i++}`);
        vals.push(gid);
        sets.push(`paired = true`);
        sets.push(`paired_at = now()`);
      }
    }
    if (!sets.length) return badRequest('אין שדות לעדכון');
    vals.push(id);

    const screen = await queryOne(
      `update screens set ${sets.join(', ')} where id = $${i}
       returning id, name, group_id, paired`,
      vals,
    );
    if (!screen) return notFound('screen not found');
    return json({ screen });
  } catch (e) {
    console.error('[screens/:id PUT]', e);
    return serverError();
  }
}

// DELETE /api/screens/:id (admin)
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireAdmin();
  if (gate instanceof Response) return gate;
  const id = params.id;
  if (!isUuid(id)) return badRequest('bad id');
  try {
    const row = await queryOne('delete from screens where id = $1 returning id', [id]);
    if (!row) return notFound('screen not found');
    return json({ ok: true });
  } catch (e) {
    console.error('[screens/:id DELETE]', e);
    return serverError();
  }
}
