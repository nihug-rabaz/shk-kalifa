import { NextRequest } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireAdmin, json, badRequest, notFound, serverError } from '@/lib/http';
import { ContentValidationError, sanitizeUpdates } from '@/lib/updates-window';
import { normalizePhotoBoard } from '@/lib/photo-board';
import { normalizeSupportLines } from '@/lib/support-lines';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// GET /api/groups/:id/content (admin)
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireAdmin();
  if (gate instanceof Response) return gate;
  const id = parseId(params.id);
  if (!id) return badRequest('bad id');
  try {
    const content = await queryOne(
      `select prayers, updates, letter, extras, updated_at from board_content where group_id = $1`,
      [id],
    );
    return json({ content: content ?? { prayers: [], updates: [], letter: null, extras: {} } });
  } catch (e) {
    console.error('[content GET]', e);
    return serverError();
  }
}

// PUT /api/groups/:id/content — replace editable board content (admin)
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireAdmin();
  if (gate instanceof Response) return gate;
  const id = parseId(params.id);
  if (!id) return badRequest('bad id');
  try {
    const group = await queryOne('select id from groups where id = $1', [id]);
    if (!group) return notFound('group not found');

    const body = await req.json().catch(() => null);
    if (!body) return badRequest('invalid body');

    // ensure a row exists
    await query('insert into board_content (group_id) values ($1) on conflict do nothing', [id]);

    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (body.prayers !== undefined) {
      if (!Array.isArray(body.prayers)) return badRequest('prayers must be an array');
      sets.push(`prayers = $${i++}`);
      vals.push(JSON.stringify(body.prayers));
    }
    if (body.updates !== undefined) {
      if (!Array.isArray(body.updates)) return badRequest('updates must be an array');
      let updates;
      try {
        updates = sanitizeUpdates(body.updates); // normalizes/validates expiresAt
      } catch (e) {
        if (e instanceof ContentValidationError) return badRequest(e.message);
        throw e;
      }
      sets.push(`updates = $${i++}`);
      vals.push(JSON.stringify(updates));
    }
    if ('letter' in body) {
      sets.push(`letter = $${i++}`);
      vals.push(body.letter ? JSON.stringify(body.letter) : null);
    }
    if (body.extras !== undefined) {
      // Free-form bag; the only key we own today is photoBoard (board 3).
      const extras = (body.extras ?? {}) as Record<string, unknown>;
      if (typeof extras !== 'object' || Array.isArray(extras)) return badRequest('extras must be an object');
      const supportLines = normalizeSupportLines(extras.supportLines);
      sets.push(`extras = $${i++}`);
      vals.push(
        JSON.stringify({
          ...extras,
          photoBoard: normalizePhotoBoard(extras.photoBoard),
          ...(supportLines ? { supportLines } : {}),
        }),
      );
    }
    if (!sets.length) return badRequest('אין שדות לעדכון');
    sets.push('updated_at = now()');
    sets.push(`updated_by = $${i++}`);
    vals.push((gate as { id: number }).id);
    vals.push(id);

    const content = await queryOne(
      `update board_content set ${sets.join(', ')} where group_id = $${i}
       returning prayers, updates, letter, extras, updated_at`,
      vals,
    );
    return json({ content });
  } catch (e) {
    console.error('[content PUT]', e);
    return serverError();
  }
}
