import { NextRequest } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { isUuid } from '@/lib/ids';
import { json, badRequest, serverError } from '@/lib/http';
import { ensureMediaSchema } from '@/lib/media-store';
import { normalizeInject } from '@/lib/inject';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/screens/:id/status — the display polls this to learn its group (public).
// Doubles as a heartbeat (updates last_seen_at).
// What a screen may report about its speakers (anything else is ignored).
const AUDIO_STATES = ['playing', 'blocked', 'injecting', 'inject-blocked', 'off', 'error'];

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id;
  if (!isUuid(id)) return badRequest('bad id');
  try {
    await ensureMediaSchema();
    // The audio-injection command rides on this poll (every 5s) so PLAY/PAUSE reach the
    // screens fast without an extra request per screen.
    const s = await queryOne(
      `select s.id, s.paired, s.group_id, g.slug as group_slug, g.name as group_name,
              g.updated_at as group_updated_at, g.inject,
              m.mime as inject_mime, m.parts as inject_parts
       from screens s
       left join groups g on g.id = s.group_id
       left join media m on m.id::text = g.inject->>'mediaId' and m.ready
       where s.id = $1`,
      [id],
    );
    if (!s) {
      return json({ found: false, paired: false, groupId: null }, { headers: noStore });
    }
    // heartbeat (fire-and-forget semantics, but awaited for correctness)
    const audio = new URL(req.url).searchParams.get('audio');
    if (audio && AUDIO_STATES.includes(audio)) {
      await query(
        'update screens set last_seen_at = now(), audio_state = $2, audio_at = now() where id = $1',
        [id, audio],
      );
    } else {
      await query('update screens set last_seen_at = now() where id = $1', [id]);
    }
    const inj = normalizeInject(s.inject);
    return json(
      {
        found: true,
        paired: s.paired && !!s.group_id,
        groupId: s.group_id,
        groupSlug: s.group_slug,
        groupName: s.group_name,
        inject:
          inj.mediaId && s.inject_mime
            ? { ...inj, url: `/api/media/${inj.mediaId}`, mime: s.inject_mime, parts: s.inject_parts }
            : null,
        serverNow: Date.now(),
        // The display shell stays loaded for days; when this changes it reloads itself so a
        // new deployment actually reaches the TVs instead of waiting for someone to restart them.
        version: process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || 'dev',
      },
      { headers: noStore },
    );
  } catch (e) {
    console.error('[screens/:id/status]', e);
    return serverError();
  }
}

const noStore = { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' };
