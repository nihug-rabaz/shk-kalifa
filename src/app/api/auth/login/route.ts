import { NextRequest } from 'next/server';
import { queryOne } from '@/lib/db';
import { verifyPassword, createSessionToken, SESSION_COOKIE, cookieOptions } from '@/lib/auth';
import { json, badRequest, unauthorized, serverError } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const username = String(body?.username ?? '').trim();
    const password = String(body?.password ?? '');
    if (!username || !password) return badRequest('נדרש שם משתמש וסיסמה');

    const admin = await queryOne(
      'select id, username, password_hash, role, display_name from admins where username = $1',
      [username],
    );
    if (!admin) return unauthorized('שם משתמש או סיסמה שגויים');

    const ok = await verifyPassword(password, admin.password_hash);
    if (!ok) return unauthorized('שם משתמש או סיסמה שגויים');

    const token = await createSessionToken({ id: admin.id, username: admin.username, role: admin.role });
    const res = json({
      ok: true,
      user: { id: admin.id, username: admin.username, role: admin.role, displayName: admin.display_name },
    });
    res.cookies.set(SESSION_COOKIE, token, cookieOptions);
    return res;
  } catch (e) {
    console.error('[auth/login]', e);
    return serverError();
  }
}
