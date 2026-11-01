import { NextResponse } from 'next/server';
import { getSession, type Session } from '@/lib/auth';

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function badRequest(error = 'bad request') {
  return NextResponse.json({ error }, { status: 400 });
}

export function unauthorized(error = 'unauthorized') {
  return NextResponse.json({ error }, { status: 401 });
}

export function notFound(error = 'not found') {
  return NextResponse.json({ error }, { status: 404 });
}

export function serverError(error = 'internal server error') {
  return NextResponse.json({ error }, { status: 500 });
}

/**
 * Guard a route to logged-in admins. Returns the session, or a 401 Response.
 * Usage:
 *   const gate = await requireAdmin();
 *   if (gate instanceof Response) return gate;
 *   // gate is the Session
 */
export async function requireAdmin(): Promise<Session | Response> {
  const session = await getSession();
  if (!session) return unauthorized();
  return session;
}
