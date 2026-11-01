// Client-side screen identity + pairing helpers (localStorage-backed).
// Each physical screen mints a stable uuid on first boot and registers it with
// the server; the admin binds it to a group via QR.

const ID_KEY = 'signage_screen_id';
const GROUP_KEY = 'signage_group_id';
const PAIRED_KEY = 'signage_paired_confirmed';

export function getScreenId(): string {
  let id = '';
  try {
    id = localStorage.getItem(ID_KEY) || '';
  } catch {
    /* storage blocked */
  }
  if (!id) {
    id = crypto.randomUUID();
    try {
      localStorage.setItem(ID_KEY, id);
    } catch {
      /* ignore */
    }
  }
  return id;
}

export function getCachedGroupId(): string | null {
  try {
    return localStorage.getItem(GROUP_KEY);
  } catch {
    return null;
  }
}

export function setCachedGroupId(groupId: string | null): void {
  try {
    if (groupId) localStorage.setItem(GROUP_KEY, groupId);
    else localStorage.removeItem(GROUP_KEY);
  } catch {
    /* ignore */
  }
}

export function isPairingConfirmed(): boolean {
  try {
    return localStorage.getItem(PAIRED_KEY) === '1';
  } catch {
    return false;
  }
}

export function setPairingConfirmed(confirmed: boolean): void {
  try {
    if (confirmed) localStorage.setItem(PAIRED_KEY, '1');
    else localStorage.removeItem(PAIRED_KEY);
  } catch {
    /* ignore */
  }
}

export function clearPairingState(): void {
  setCachedGroupId(null);
  setPairingConfirmed(false);
}

export async function unpairScreen(id: string): Promise<void> {
  try {
    await fetch(`/api/screens/${id}/unpair`, { method: 'POST' });
  } catch {
    /* offline */
  }
  clearPairingState();
}

export async function registerScreen(id: string): Promise<void> {
  try {
    await fetch('/api/screens/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
  } catch {
    /* offline — fine */
  }
}

export interface ScreenStatus {
  found: boolean;
  paired: boolean;
  groupId: number | null;
  groupName?: string | null;
  inject?: InjectCommand | null;
  serverNow?: number;
  version?: string;
}

/** What a screen reports about its own sound (see /api/screens/:id/status). */
export type AudioState = 'playing' | 'blocked' | 'injecting' | 'inject-blocked' | 'off' | 'error';

/** Audio-injection command for the screen's group (see src/lib/inject.ts). */
export interface InjectCommand {
  mediaId: string;
  playing: boolean;
  startedAt: number | null;
  offset: number;
  url: string;
  mime: string;
  parts: number;
}

/** `audio` reports what this screen's speakers are doing, so it shows up in the admin. */
export async function getScreenStatus(id: string, audio?: string): Promise<ScreenStatus | null> {
  try {
    const qs = audio ? `?audio=${encodeURIComponent(audio)}` : '';
    const r = await fetch(`/api/screens/${id}/status${qs}`, { cache: 'no-store' });
    if (!r.ok) return null;
    return (await r.json()) as ScreenStatus;
  } catch {
    return null; // offline
  }
}
