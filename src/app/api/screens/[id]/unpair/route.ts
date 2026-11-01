import { NextRequest } from 'next/server';
import { queryOne } from '@/lib/db';
import { isUuid } from '@/lib/ids';
import { json, badRequest, notFound, serverError } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id;
  if (!isUuid(id)) return badRequest('bad id');
  try {
    const screen = await queryOne(
      `update screens set group_id = null, paired = false where id = $1 returning id`,
      [id],
    );
    if (!screen) return notFound('screen not found');
    return json({ ok: true });
  } catch (e) {
    console.error('[screens/:id/unpair]', e);
    return serverError();
  }
}
