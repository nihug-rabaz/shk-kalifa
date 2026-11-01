import { SESSION_COOKIE, cookieOptions } from '@/lib/auth';
import { json } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const res = json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { ...cookieOptions, maxAge: 0 });
  return res;
}
