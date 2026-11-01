import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'sig_session';

export interface Session {
  id: number;
  username: string;
  role: string;
}

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET is not set. Add it to .env.local');
  return new TextEncoder().encode(s);
}

export async function createSessionToken(admin: { id: number; username: string; role: string }): Promise<string> {
  return new SignJWT({ username: admin.username, role: admin.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(admin.id))
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret());
}

export async function verifySessionToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      id: Number(payload.sub),
      username: String(payload.username ?? ''),
      role: String(payload.role ?? 'admin'),
    };
  } catch {
    return null;
  }
}

/** Read the current admin session from the request cookies (route handlers / RSC). */
export async function getSession(): Promise<Session | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 60 * 60 * 24 * 30, // 30 days
};

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
