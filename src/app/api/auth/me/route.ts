import { getSession } from '@/lib/auth';
import { json, unauthorized } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();
  return json({ user: session });
}
