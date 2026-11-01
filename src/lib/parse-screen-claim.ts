const SCREEN_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseScreenIdFromScan(text: string): string | null {
  const raw = text.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const screen = url.searchParams.get('screen');
    if (screen && SCREEN_UUID.test(screen)) return screen;
  } catch {
    /* not a URL */
  }
  if (SCREEN_UUID.test(raw)) return raw;
  const m = raw.match(/screen=([0-9a-f-]{36})/i);
  if (m && SCREEN_UUID.test(m[1])) return m[1];
  return null;
}
