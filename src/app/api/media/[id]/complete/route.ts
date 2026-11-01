import { NextRequest } from 'next/server';
import { queryOne } from '@/lib/db';
import { isUuid } from '@/lib/ids';
import { requireAdmin, json, badRequest, notFound, serverError } from '@/lib/http';
import { ensureMediaSchema } from '@/lib/media-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/media/:id/complete — verify every part arrived, then publish the file (admin)
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireAdmin();
  if (gate instanceof Response) return gate;
  const { id } = params;
  if (!isUuid(id)) return badRequest('bad id');
  try {
    await ensureMediaSchema();
    const row = await queryOne(
      `select m.parts, m.size_bytes,
              (select count(*)::int from media_parts p where p.media_id = m.id) as got,
              (select coalesce(sum(length(p.data)), 0)::bigint from media_parts p where p.media_id = m.id) as bytes
       from media m where m.id = $1`,
      [id],
    );
    if (!row) return notFound();
    if (row.got !== row.parts || Number(row.bytes) !== row.size_bytes) {
      return badRequest('ההעלאה לא הושלמה — נסה שוב');
    }
    const media = await queryOne(
      `update media set ready = true where id = $1
       returning id, kind, filename, mime, size_bytes, sort_order, created_at`,
      [id],
    );
    return json({ media });
  } catch (e) {
    console.error('[media/:id/complete POST]', e);
    return serverError();
  }
}
