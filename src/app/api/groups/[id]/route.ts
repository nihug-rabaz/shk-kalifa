import { NextRequest } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireAdmin, json, badRequest, notFound, serverError } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// GET /api/groups/:id — group + its board content (admin)
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireAdmin();
  if (gate instanceof Response) return gate;
  const id = parseId(params.id);
  if (!id) return badRequest('bad id');
  try {
    const group = await queryOne(
      `select id, name, slug, display_name, location, theme, music, created_at, updated_at
       from groups where id = $1`,
      [id],
    );
    if (!group) return notFound('group not found');
    const content = await queryOne(
      `select prayers, updates, letter, extras, updated_at from board_content where group_id = $1`,
      [id],
    );
    return json({
      group,
      content: content ?? { prayers: [], updates: [], letter: null, extras: {} },
    });
  } catch (e) {
    console.error('[groups/:id GET]', e);
    return serverError();
  }
}

// PUT /api/groups/:id — update group meta (admin)
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireAdmin();
  if (gate instanceof Response) return gate;
  const id = parseId(params.id);
  if (!id) return badRequest('bad id');
  try {
    const body = await req.json().catch(() => null);
    if (!body) return badRequest('invalid body');

    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return badRequest('שם קבוצה לא יכול להיות ריק');
      sets.push(`name = $${i++}`);
      vals.push(name);
    }
    if (body.display_name !== undefined) {
      sets.push(`display_name = $${i++}`);
      vals.push(body.display_name ? String(body.display_name) : null);
    }
    if (body.location !== undefined) {
      sets.push(`location = $${i++}`);
      vals.push(JSON.stringify(body.location));
    }
    if (body.theme !== undefined) {
      sets.push(`theme = $${i++}`);
      vals.push(JSON.stringify(body.theme));
    }
    if (body.music !== undefined) {
      sets.push(`music = $${i++}`);
      vals.push(JSON.stringify(body.music));
    }
    if (!sets.length) return badRequest('אין שדות לעדכון');
    sets.push('updated_at = now()');
    vals.push(id);

    const group = await queryOne(
      `update groups set ${sets.join(', ')} where id = $${i}
       returning id, name, slug, display_name, location, theme, music, updated_at`,
      vals,
    );
    if (!group) return notFound('group not found');
    return json({ group });
  } catch (e) {
    console.error('[groups/:id PUT]', e);
    return serverError();
  }
}

// DELETE /api/groups/:id — remove a group (content + media cascade; screens unlinked) (admin)
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireAdmin();
  if (gate instanceof Response) return gate;
  const id = parseId(params.id);
  if (!id) return badRequest('bad id');
  try {
    const row = await queryOne('delete from groups where id = $1 returning id', [id]);
    if (!row) return notFound('group not found');
    return json({ ok: true });
  } catch (e) {
    console.error('[groups/:id DELETE]', e);
    return serverError();
  }
}
