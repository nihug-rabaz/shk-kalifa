// "מוקדי תמיכה" — the support-desk list in the LEFT column of board 1
// (public/welcome1/index.html → .div-6). Stored in board_content.extras.supportLines.
//
// When the column has never been edited the field is absent, and the board keeps
// the numbers baked into its own HTML — so screens that predate this feature
// don't suddenly lose the list.

import type { SupportLine } from '@/lib/types';

export const MAX_SUPPORT_LINES = 6;

/** Exactly what public/welcome1/index.html ships with — used to seed the editor. */
export const DEFAULT_SUPPORT_LINES: SupportLine[] = [
  { id: 'tikshuv', label: 'מוקד תקשוב', phone: '073-2432221' },
  { id: 'masan', label: 'מדור משא"ן', phone: '073-2432108' },
  { id: 'tash', label: 'משרד ת"ש', phone: '073-2432109' },
];

function clean(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/** null → "never configured, board keeps its built-in list". */
export function normalizeSupportLines(raw: unknown): SupportLine[] | null {
  if (!Array.isArray(raw)) return null;
  return raw
    .map((item, i) => {
      const r = (item ?? {}) as Record<string, unknown>;
      return {
        id: clean(r.id, 64) || `line-${i}`,
        label: clean(r.label, 40),
        phone: clean(r.phone, 32),
      };
    })
    .filter((l) => l.label || l.phone)
    .slice(0, MAX_SUPPORT_LINES);
}
