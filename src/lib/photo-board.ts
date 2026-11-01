// The third board — a single full-screen image that alternates with boards 1 & 2.
//
// Config lives in board_content.extras.photoBoard (the `extras` jsonb column
// already existed, so no migration was needed). It only joins the rotation when
// it is BOTH enabled and has an image; otherwise the kiosk keeps flipping
// between boards 1 and 2 exactly as before.

import type { PhotoBoard } from '@/lib/types';

export const DEFAULT_PHOTO_BOARD: PhotoBoard = { enabled: false, imageUrl: null, fit: 'cover' };

export function normalizePhotoBoard(raw: unknown): PhotoBoard {
  const p = (raw ?? {}) as Record<string, unknown>;
  const url = typeof p.imageUrl === 'string' && p.imageUrl.trim() ? p.imageUrl.trim() : null;
  return {
    enabled: !!p.enabled,
    imageUrl: url,
    fit: p.fit === 'contain' ? 'contain' : 'cover',
  };
}

/** Enabled AND has an image → it takes a slot in the rotation. */
export function isPhotoBoardLive(raw: unknown): boolean {
  const pb = normalizePhotoBoard(raw);
  return !!(pb.enabled && pb.imageUrl);
}

/** The boards the kiosk cycles through, in order. */
export function boardRotation(photoBoardLive: boolean): number[] {
  return photoBoardLive ? [1, 2, 3] : [1, 2];
}
