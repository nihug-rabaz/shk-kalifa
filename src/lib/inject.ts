import 'server-only';
import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';

// "Audio injection": a password-gated admin feature that interrupts a group's background music with
// a chosen track (PLAY) and returns to the background song where it left off (PAUSE). The state
// lives in groups.inject and reaches the screens through their 5s status poll.
//
// THE PASSWORD IS NEVER STORED ANYWHERE — not in this file, not in the build, not in Vercel.
// Only a one-way bcrypt hash of it is kept, in INJECT_PASSWORD_HASH. A hash cannot be turned back
// into the password, so reading the environment variable (or this repository, or a build artifact)
// does not reveal it. Generate the hash with `npm run inject:password`, which asks for the password
// locally, prints only the hash, and never writes the password to disk.
//
// With no hash configured the feature is closed to everyone — it never falls back to a built-in
// password.

export interface InjectState {
  mediaId: string | null;
  playing: boolean;
  startedAt: number | null; // server epoch ms of the last PLAY
  offset: number; // seconds into the track at startedAt (where PAUSE left it)
}

export const EMPTY_INJECT: InjectState = { mediaId: null, playing: false, startedAt: null, offset: 0 };

export function normalizeInject(raw: any): InjectState {
  return {
    mediaId: typeof raw?.mediaId === 'string' ? raw.mediaId : null,
    playing: !!raw?.playing,
    startedAt: typeof raw?.startedAt === 'number' ? raw.startedAt : null,
    offset: typeof raw?.offset === 'number' && raw.offset > 0 ? raw.offset : 0,
  };
}

const HASH = (process.env.INJECT_PASSWORD_HASH || '').trim();

/** Same answer for a wrong password and for a missing header — nothing to probe. */
const denied = () => NextResponse.json({ error: 'סיסמה שגויה' }, { status: 403 });

/**
 * null when the x-inject-password header matches the configured hash, else a refusal.
 * bcrypt is deliberately slow, which also blunts guessing.
 */
export async function checkInjectPassword(req: Request): Promise<Response | null> {
  if (!HASH) {
    return NextResponse.json(
      { error: 'הזרקת שמע לא הוגדרה בשרת (חסר INJECT_PASSWORD_HASH)' },
      { status: 503 },
    );
  }
  const given = req.headers.get('x-inject-password') || '';
  if (!given) return denied();
  try {
    return (await bcrypt.compare(given, HASH)) ? null : denied();
  } catch {
    return denied();
  }
}
