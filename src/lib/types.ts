// Shared content types. Field names mirror EXACTLY what public/welcome*/board-data.js
// reads from GET /api/display/content — do not rename without updating the display engine.

export type PrayerLocation = 'בית כנסת מרכזי' | 'בית כנסת רבנות' | 'חמל רבצר' | (string & {});

export interface Prayer {
  id: string;
  title: string; // "שחרית" | "מנחה" | "ערבית" ...
  timeType: 'fixed' | 'relative';
  fixedTime?: string; // "HH:MM"
  relativeBase?: 'sunset' | 'stars_out' | 'stars_out_90';
  offsetMinutes?: number;
  location?: PrayerLocation;
}

// The board matches update.type by substring against these Hebrew categories.
export type UpdateType =
  | 'דגשי בטיחות'
  | 'הידעת?'
  | 'ימי ישיבה'
  | 'עדכון כללי'
  | (string & {});

export interface BoardUpdate {
  id: string;
  title: string;
  type?: UpdateType;
  content?: string;
  imageUrl?: string; // absolute (/api/media/:id) or relative to /welcomeN/img/
  displayTime?: number; // seconds per rotation (default 20)
  /** End of the display window, ISO-8601. null/undefined = show forever.
   *  Enforced by src/lib/updates-window.ts (server) + public/board-schedule.js (board). */
  expiresAt?: string | null;
}

export interface Letter {
  id?: string;
  html?: string;
  parasha?: string;
  signature?: string;
}

export interface GroupLocation {
  label?: string;
  latitude?: number;
  longitude?: number;
  elevation?: number;
  timezone?: string;
}

export interface Theme {
  primaryHex?: string;
  gradient?: string[]; // [c1, c2]
}

export interface MusicConfig {
  enabled: boolean;
  volume: number; // 0..1
  shuffle: boolean;
  loop: boolean;
}

export interface MusicTrack {
  id: string;
  url: string; // /api/media/:id
  filename: string;
  mime: string;
  parts: number; // > 0 → fetch `${url}?part=0..parts-1` and join (Vercel 4.5 MB body cap)
}

export interface BoardContent {
  prayers: Prayer[];
  updates: BoardUpdate[];
  letter: Letter | null;
  updated_at?: string;
}

export interface Group {
  id: number;
  name: string;
  slug: string;
  display_name?: string | null;
  location: GroupLocation;
  theme: Theme;
  music: MusicConfig;
  updated_at?: string;
}

// ── Board 3: a full-screen photo that joins the board rotation ───────────────
// Stored in board_content.extras.photoBoard; served by public/welcome3.
export interface PhotoBoard {
  enabled: boolean;
  imageUrl?: string | null; // /api/media/:id
  fit?: 'cover' | 'contain'; // fill the screen (may crop) | fit whole image
}

export interface BoardExtras {
  photoBoard?: PhotoBoard;
  supportLines?: SupportLine[];
}

// ── "מוקדי תמיכה" — the support numbers down the left edge of board 1 ────────
export interface SupportLine {
  id: string;
  label: string; // e.g. "מוקד תקשוב"
  phone: string; // e.g. "073-2432221"
}
