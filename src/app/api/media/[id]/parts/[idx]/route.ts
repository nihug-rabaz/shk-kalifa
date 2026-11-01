import { NextRequest } from 'next/server';
import { queryOne } from '@/lib/db';
import { isUuid } from '@/lib/ids';
import { requireAdmin, json, badRequest, notFound, serverError } from '@/lib/http';
import { CHUNK_BYTES, ensureMediaSchema } from '@/lib/media-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PUT /api/media/:id/parts/:idx — one raw binary part of a chunked upload (admin)
export async function PUT(req: NextRequest, { params }: { params: { id: string; idx: string } }) {
  const gate = await requireAdmin();
  if (gate instanceof Response) return gate;
  const { id } = params;
  const idx = Number(params.idx);
  if (!isUuid(id) || !Number.isInteger(idx) || idx < 0) return badRequest('bad id');
  try {
    await ensureMediaSchema();
    const row = await queryOne('select parts, ready from media where id = $1', [id]);
    if (!row) return notFound();
    if (row.ready) return badRequest('ההעלאה כבר הושלמה');
    if (idx >= row.parts) return badRequest('bad part');

    const buf = Buffer.from(await req.arrayBuffer());
    if (buf.length === 0 || buf.length > CHUNK_BYTES) return badRequest('bad part size');

    await queryOne(
      `insert into media_parts (media_id, idx, data) values ($1, $2, $3)
       on conflict (media_id, idx) do update set data = excluded.data`,
      [id, idx, buf],
    );
    return json({ ok: true });
  } catch (e) {
    console.error('[media/:id/parts PUT]', e);
    return serverError();
  }
}
