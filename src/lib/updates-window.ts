// Per-update display window — "כמה זמן העדכון יופיע על המסך".
//
// `expiresAt` on a BoardUpdate is an ISO-8601 instant; null/undefined means the
// update is shown forever. Filtering happens in TWO places on purpose:
//
//   • the server strips expired updates out of /api/display/content, so a screen
//     can never show stale content even if its bundled board JS is old;
//   • the board filters again while rendering (public/board-schedule.js), so an
//     update disappears the moment it expires instead of waiting for the next
//     poll — and it keeps working while the screen runs on its offline cache.

import type { BoardUpdate } from '@/lib/types';

export class ContentValidationError extends Error {}

/** ISO string for a valid instant, null for "forever". Throws on garbage. */
export function normalizeExpiresAt(raw: unknown, label = 'עדכון'): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string' && raw.trim() === '') return null;
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    throw new ContentValidationError(`תאריך תפוגה לא תקין ב"${label}"`);
  }
  const ms = new Date(raw as string | number).getTime();
  if (Number.isNaN(ms)) {
    throw new ContentValidationError(`תאריך תפוגה לא תקין ב"${label}"`);
  }
  return new Date(ms).toISOString();
}

/** Is the update inside its display window right now? Unparsable → treated as forever. */
export function isUpdateActive(u: { expiresAt?: string | null } | null | undefined, nowMs = Date.now()): boolean {
  const exp = u?.expiresAt;
  if (!exp) return true;
  const ms = Date.parse(exp);
  if (Number.isNaN(ms)) return true;
  return ms > nowMs;
}

export function activeUpdates<T extends { expiresAt?: string | null }>(
  list: T[] | null | undefined,
  nowMs = Date.now(),
): T[] {
  if (!Array.isArray(list)) return [];
  return list.filter((u) => isUpdateActive(u, nowMs));
}

/** Validates + normalizes the `updates` array coming from the admin panel. */
export function sanitizeUpdates(raw: unknown): BoardUpdate[] {
  if (!Array.isArray(raw)) throw new ContentValidationError('updates must be an array');
  return raw.map((item) => {
    const u = (item ?? {}) as Record<string, unknown>;
    const label = String(u.title || u.type || 'עדכון');
    return { ...(u as unknown as BoardUpdate), expiresAt: normalizeExpiresAt(u.expiresAt, label) };
  });
}
