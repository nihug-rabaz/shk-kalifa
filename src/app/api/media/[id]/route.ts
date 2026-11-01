import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { isUuid } from '@/lib/ids';
import { requireAdmin, badRequest, notFound, serverError, json } from '@/lib/http';
import { ensureMediaSchema } from '@/lib/media-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IMMUTABLE = 'public, max-age=31536000, immutable';

// zero-copy view; cast around TS's generic-TypedArray/BodyInit friction (runtime accepts it)
const view = (buf: Buffer) => new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);

// GET /api/media/:id — serve the binary (public). Immutable: the id is unique per upload,
// so browsers and the display's IndexedDB cache can keep it forever (offline playback).
// Chunked files (parts > 0): ?part=N serves one part, which keeps every response under
// Vercel's 4.5 MB cap — the display fetches parts and joins them. Without ?part the whole
// file is streamed part by part (for direct links / <audio src>).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id;
  if (!isUuid(id)) return badRequest('bad id');
  try {
    await ensureMediaSchema();
    const row = await queryOne(
      'select mime, data, parts, size_bytes from media where id = $1 and ready',
      [id],
    );
    if (!row) return notFound();
    const mime = row.mime || 'application/octet-stream';

    if (!row.parts) {
      const buf: Buffer = row.data;
      return new NextResponse(view(buf) as unknown as BodyInit, {
        headers: {
          'Content-Type': mime,
          'Content-Length': String(buf.byteLength),
          'Cache-Control': IMMUTABLE,
          'Accept-Ranges': 'bytes',
        },
      });
    }

    const partParam = new URL(req.url).searchParams.get('part');
    if (partParam !== null) {
      const idx = Number(partParam);
      if (!Number.isInteger(idx) || idx < 0 || idx >= row.parts) return badRequest('bad part');
      const part = await queryOne('select data from media_parts where media_id = $1 and idx = $2', [id, idx]);
      if (!part) return notFound();
      const buf: Buffer = part.data;
      return new NextResponse(view(buf) as unknown as BodyInit, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(buf.byteLength),
          'Cache-Control': IMMUTABLE,
        },
      });
    }

    const parts: number = row.parts;
    let next = 0;
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (next >= parts) {
          controller.close();
          return;
        }
        const part = await queryOne('select data from media_parts where media_id = $1 and idx = $2', [id, next++]);
        if (!part) {
          controller.error(new Error('missing part'));
          return;
        }
        controller.enqueue(view(part.data));
      },
    });
    return new NextResponse(stream, {
      headers: {
        'Content-Type': mime,
        'Content-Length': String(row.size_bytes),
        'Cache-Control': IMMUTABLE,
      },
    });
  } catch (e) {
    console.error('[media/:id GET]', e);
    return serverError();
  }
}

// DELETE /api/media/:id (admin)
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireAdmin();
  if (gate instanceof Response) return gate;
  const id = params.id;
  if (!isUuid(id)) return badRequest('bad id');
  try {
    await ensureMediaSchema();
    const row = await queryOne('delete from media where id = $1 returning id, group_id', [id]);
    if (!row) return notFound();
    // deleting the selected injection track also stops it on the screens
    await queryOne(
      `update groups set inject = null where id = $1 and inject->>'mediaId' = $2`,
      [row.group_id, id],
    );
    return json({ ok: true });
  } catch (e) {
    console.error('[media/:id DELETE]', e);
    return serverError();
  }
}
