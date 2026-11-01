import { NextRequest } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireAdmin, json, badRequest, notFound, serverError } from '@/lib/http';
import { CHUNK_BYTES, MAX_MUSIC_BYTES, audioMime, ensureMediaSchema } from '@/lib/media-store';
import { checkInjectPassword } from '@/lib/inject';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_MUSIC = 25 * 1024 * 1024; // 25 MB — legacy single-request music upload
const MAX_IMAGE = 10 * 1024 * 1024; // 10 MB

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// GET /api/groups/:id/media?kind=music — list media metadata (admin)
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireAdmin();
  if (gate instanceof Response) return gate;
  const id = parseId(params.id);
  if (!id) return badRequest('bad id');
  try {
    await ensureMediaSchema();
    const kind = new URL(req.url).searchParams.get('kind');
    const rows = kind
      ? await query(
          `select id, kind, filename, mime, size_bytes, sort_order, created_at
           from media where group_id = $1 and kind = $2 and ready order by sort_order asc, created_at asc`,
          [id, kind],
        )
      : await query(
          `select id, kind, filename, mime, size_bytes, sort_order, created_at
           from media where group_id = $1 and ready order by kind asc, sort_order asc, created_at asc`,
          [id],
        );
    return json({ media: rows });
  } catch (e) {
    console.error('[media GET]', e);
    return serverError();
  }
}

// POST /api/groups/:id/media (admin)
//   JSON  { kind: 'music', filename, mime, size } → starts a chunked upload; the client then
//         PUTs each part to /api/media/:id/parts/:idx and POSTs /api/media/:id/complete.
//   multipart (file, kind=image)                  → single-request image upload.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireAdmin();
  if (gate instanceof Response) return gate;
  const id = parseId(params.id);
  if (!id) return badRequest('bad id');
  try {
    await ensureMediaSchema();
    const group = await queryOne('select id from groups where id = $1', [id]);
    if (!group) return notFound('group not found');

    if ((req.headers.get('content-type') || '').includes('application/json')) {
      const body = await req.json().catch(() => null);
      // injected tracks live apart from the playlist and are password-gated
      if (body?.kind === 'inject') {
        const denied = await checkInjectPassword(req);
        if (denied) return denied;
      }
      return startChunked(id, body);
    }

    const form = await req.formData();
    const file = form.get('file');
    const kind = String(form.get('kind') || 'music') === 'image' ? 'image' : 'music';
    if (!(file instanceof File)) return badRequest('קובץ חסר');

    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length === 0) return badRequest('קובץ ריק');
    const max = kind === 'music' ? MAX_MUSIC : MAX_IMAGE;
    if (buf.length > max) return badRequest(`הקובץ גדול מדי (מקסימום ${Math.round(max / 1048576)}MB)`);

    const mime =
      kind === 'music'
        ? audioMime(file.type, file.name)
        : file.type || 'application/octet-stream';
    if (kind === 'music' && !mime) return badRequest('נדרש קובץ שמע');
    if (kind === 'image' && !mime!.startsWith('image/')) return badRequest('נדרש קובץ תמונה');

    const row = await queryOne(
      `insert into media (group_id, kind, filename, mime, size_bytes, sort_order, data)
       values ($1, $2, $3, $4, $5,
               (select coalesce(max(sort_order), -1) + 1 from media where group_id = $1 and kind = $2), $6)
       returning id, kind, filename, mime, size_bytes, sort_order, created_at`,
      [id, kind, String(file.name).slice(0, 200), mime, buf.length, buf],
    );
    return json({ media: row }, { status: 201 });
  } catch (e) {
    console.error('[media POST]', e);
    return serverError();
  }
}

async function startChunked(groupId: number, body: any) {
  const kind = body?.kind === 'inject' ? 'inject' : 'music';
  const duration = Number(body?.duration);
  const meta = Number.isFinite(duration) && duration > 0 ? { duration } : {};
  const filename = String(body?.filename || '').slice(0, 200);
  const size = Number(body?.size);
  if (!filename || !Number.isInteger(size)) return badRequest('invalid body');
  if (size <= 0) return badRequest('קובץ ריק');
  if (size > MAX_MUSIC_BYTES) {
    return badRequest(`הקובץ גדול מדי (מקסימום ${Math.round(MAX_MUSIC_BYTES / 1048576)}MB)`);
  }
  const mime = audioMime(String(body?.mime || ''), filename);
  if (!mime) return badRequest('נדרש קובץ שמע');

  const parts = Math.ceil(size / CHUNK_BYTES);
  const row = await queryOne(
    `insert into media (group_id, kind, filename, mime, size_bytes, sort_order, data, parts, ready, meta)
     values ($1, $6, $2, $3, $4,
             (select coalesce(max(sort_order), -1) + 1 from media where group_id = $1 and kind = $6),
             null, $5, false, $7)
     returning id, kind, filename, mime, size_bytes, sort_order, created_at`,
    [groupId, filename, mime, size, parts, kind, JSON.stringify(meta)],
  );
  return json({ media: row, chunkSize: CHUNK_BYTES, parts }, { status: 201 });
}
