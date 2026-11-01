import type { MusicTrack } from '@/lib/types';
import { activeUpdates } from '@/lib/updates-window';
import { normalizePhotoBoard } from '@/lib/photo-board';
import { normalizeSupportLines } from '@/lib/support-lines';

const DEFAULT_DISPLAY_NAME = 'מפקדת הרבנות הצבאית';
const DEFAULT_GRADIENT = ['#bbdfc5', '#d9efe0'];

// Builds the exact payload shape consumed by public/welcome*/board-data.js.
// `group` and `content` are raw DB rows; `tracks` are resolved media refs.
export function buildDisplayPayload(
  group: any,
  content: any | null,
  tracks: MusicTrack[],
) {
  const theme = group?.theme ?? {};
  const gradient =
    Array.isArray(theme.gradient) && theme.gradient.length >= 2
      ? theme.gradient
      : [theme.primaryHex || DEFAULT_GRADIENT[0], DEFAULT_GRADIENT[1]];
  const primaryHex = theme.primaryHex || gradient[0];
  const music = group?.music ?? {};

  return {
    boardId: String(group.id),
    boardInfo: {
      name: group.name,
      display_name: group.display_name || DEFAULT_DISPLAY_NAME,
      location: group.location ?? {},
      synagogue_id: null,
      theme: { primaryHex, gradient },
    },
    theme: { primaryHex, gradient },
    background: { type: 'gradient', colors: gradient },
    prayers: content?.prayers ?? [],
    // Updates past their display window never reach the screen (see updates-window.ts).
    updates: activeUpdates(content?.updates ?? []),
    letter: content?.letter ?? null,
    // Board 3 (full-screen photo) — see src/lib/photo-board.ts.
    photoBoard: normalizePhotoBoard(content?.extras?.photoBoard),
    // null → board 1 keeps the support numbers baked into its own HTML.
    supportLines: normalizeSupportLines(content?.extras?.supportLines),
    // NEW: background music block (offline-cached client-side).
    music: {
      enabled: !!music.enabled,
      volume: typeof music.volume === 'number' ? music.volume : 0.6,
      shuffle: music.shuffle !== false,
      loop: music.loop !== false,
      tracks,
    },
    lastUpdatedAt: content?.updated_at || group?.updated_at || null,
  };
}
