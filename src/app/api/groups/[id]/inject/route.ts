import { NextRequest } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { isUuid } from '@/lib/ids';
import { requireAdmin, json, badRequest, notFound, serverError } from '@/lib/http';
import { ensureMediaSchema } from '@/lib/media-store';
import { EMPTY_INJECT, checkInjectPassword, normalizeInject, type InjectState } from '@/lib/inject';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// POST /api/groups/:id/inject — admin + x-inject-password header.
//   { action: 'unlock' }            → current state + injectable tracks
//   { action: 'select', mediaId }   → choose the track (stopped, from the start)
//   { action: 'play' }              → screens pause the background song and play it
//   { action: 'pause' }             → screens stop it and resume the background song
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireAdmin();
  if (gate instanceof Response) return gate;
  const denied = checkInjectPassword(req);
  if (denied) return denied;
  const id = parseId(params.id);
  if (!id) return badRequest('bad id');
  try {
    await ensureMediaSchema();
    const body = await req.json().catch(() => null);
    const group = await queryOne('select inject from groups where id = $1', [id]);
    if (!group) return notFound('group not found');

    const media = await query(
      `select id, filename, size_bytes, (meta->>'duration')::float as duration
       from media where group_id = $1 and kind = 'inject' and ready
       order by sort_order asc, created_at asc`,
      [id],
    );
    let state = normalizeInject(group.inject);
    if (state.mediaId && !media.some((m) => m.id === state.mediaId)) state = { ...EMPTY_INJECT };
    const now = Date.now();
    const action = body?.action;

    if (action === 'select') {
      const mediaId = body?.mediaId;
      if (mediaId !== null && (!isUuid(mediaId) || !media.some((m) => m.id === mediaId))) {
        return badRequest('קובץ לא נמצא');
      }
      state = { ...EMPTY_INJECT, mediaId };
    } else if (action === 'play') {
      if (!state.mediaId) return badRequest('בחר קובץ להזרקה');
      const duration = media.find((m) => m.id === state.mediaId)?.duration;
      const position =
        state.playing && state.startedAt ? state.offset + (now - state.startedAt) / 1000 : state.offset;
      const finished = !!duration && position >= duration - 0.5;
      // PLAY while it's still playing is a no-op; once the track has finished it starts over
      if (!state.playing || finished) {
        state = { ...state, playing: true, startedAt: now, offset: finished ? 0 : state.offset };
      }
    } else if (action === 'pause') {
      if (state.playing && state.startedAt) {
        const duration = media.find((m) => m.id === state.mediaId)?.duration;
        let offset = state.offset + (now - state.startedAt) / 1000;
        if (duration) offset = Math.min(offset, duration);
        state = { ...state, playing: false, startedAt: null, offset };
      }
    } else if (action !== 'unlock') {
      return badRequest('bad action');
    }

    if (action !== 'unlock') {
      await query('update groups set inject = $1 where id = $2', [JSON.stringify(state), id]);
    }
    return json({ state: state as InjectState, media, serverNow: now });
  } catch (e) {
    console.error('[groups/:id/inject POST]', e);
    return serverError();
  }
}
