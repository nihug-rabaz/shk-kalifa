import { NextRequest } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireAdmin, json, badRequest, serverError } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function uniqueSlug(name: string): Promise<string> {
  let base = slugify(name);
  if (base.length < 2) base = 'group';
  let slug = base;
  let n = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await queryOne('select 1 from groups where slug = $1', [slug])) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
}

// GET /api/groups — list all groups with screen counts (admin)
export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof Response) return gate;
  try {
    const groups = await query(`
      select g.id, g.name, g.slug, g.location, g.theme, g.music, g.created_at, g.updated_at,
             (select count(*) from screens s where s.group_id = g.id) as screen_count,
             (select coalesce(bc.updated_at, g.updated_at) from board_content bc where bc.group_id = g.id) as content_updated_at
      from groups g
      order by g.id asc`);
    return json({ groups });
  } catch (e) {
    console.error('[groups GET]', e);
    return serverError();
  }
}

// POST /api/groups — create a group + empty content row (admin)
export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof Response) return gate;
  try {
    const body = await req.json().catch(() => null);
    const name = String(body?.name ?? '').trim();
    if (!name) return badRequest('נדרש שם קבוצה');

    const location = body?.location ?? {};
    const theme = body?.theme ?? { primaryHex: '#1c4080', gradient: ['#bbdfc5', '#d9efe0'] };
    const music = body?.music ?? { enabled: false, volume: 0.6, shuffle: true, loop: true };
    const slug = await uniqueSlug(name);

    const g = await queryOne(
      `insert into groups (name, slug, location, theme, music)
       values ($1, $2, $3, $4, $5)
       returning id, name, slug, location, theme, music, created_at, updated_at`,
      [name, slug, JSON.stringify(location), JSON.stringify(theme), JSON.stringify(music)],
    );
    await query('insert into board_content (group_id) values ($1) on conflict do nothing', [g!.id]);
    return json({ group: g }, { status: 201 });
  } catch (e) {
    console.error('[groups POST]', e);
    return serverError();
  }
}
