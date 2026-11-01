import { query } from '@/lib/db';
import { requireAdmin, json, serverError } from '@/lib/http';
import { ensureMediaSchema } from '@/lib/media-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/screens — list all screens with their group + liveness (admin)
export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof Response) return gate;
  try {
    await ensureMediaSchema();
    const screens = await query(
      `select s.id, s.name, s.group_id, s.paired, s.last_seen_at, s.paired_at, s.created_at,
              s.user_agent, g.name as group_name, g.slug as group_slug,
              (s.last_seen_at is not null and s.last_seen_at > now() - interval '90 seconds') as online,
              case when s.audio_at > now() - interval '90 seconds' then s.audio_state end as audio_state
       from screens s
       left join groups g on g.id = s.group_id
       order by s.last_seen_at desc nulls last, s.created_at desc`,
    );
    return json({ screens });
  } catch (e) {
    console.error('[screens GET]', e);
    return serverError();
  }
}
