import { NextRequest } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { buildDisplayPayload } from '@/lib/display-payload';
import { json, badRequest, notFound, serverError } from '@/lib/http';
import { ensureMediaSchema } from '@/lib/media-store';
import type { MusicTrack } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Public read consumed by the display engine (board-data.js).
// `boardId` is the GROUP id — every screen in a group polls the same board.
export async function GET(req: NextRequest) {
  try {
    const boardId = new URL(req.url).searchParams.get('boardId');
    if (!boardId) return badRequest('boardId required');

    const groupId = Number(boardId);
    if (!Number.isInteger(groupId)) return notFound('board not found');

    const group = await queryOne(
      `select id, name, slug, display_name, location, theme, music, updated_at
       from groups where id = $1`,
      [groupId],
    );
    if (!group) return notFound('board not found');

    const content = await queryOne(
      `select prayers, updates, letter, extras, updated_at from board_content where group_id = $1`,
      [groupId],
    );

    await ensureMediaSchema();
    const tracks = await query(
      `select id, filename, mime, parts from media
       where group_id = $1 and kind = 'music' and ready
       order by sort_order asc, created_at asc`,
      [groupId],
    );
    const trackList: MusicTrack[] = tracks.map((t) => ({
      id: t.id,
      url: `/api/media/${t.id}`,
      filename: t.filename,
      mime: t.mime,
      parts: t.parts,
    }));

    const payload = buildDisplayPayload(group, content, trackList);
    return json(payload, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
      },
    });
  } catch (e) {
    console.error('[display/content]', e);
    return serverError();
  }
}
