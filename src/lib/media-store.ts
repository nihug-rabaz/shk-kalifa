import 'server-only';
import { query } from '@/lib/db';

// Vercel caps a function's request AND response body at 4.5 MB, so a music file
// can't travel in one request. Large files are uploaded and served in parts of
// CHUNK_BYTES, stored in media_parts; media.data stays null for those rows.
export const CHUNK_BYTES = 3 * 1024 * 1024;
export const MAX_MUSIC_BYTES = 60 * 1024 * 1024;

// Additive, idempotent — mirrors db/schema.sql so existing databases upgrade on
// first use without a manual migration.
const SCHEMA = `
  alter table media alter column data drop not null;
  alter table media add column if not exists parts integer not null default 0;
  alter table media add column if not exists ready boolean not null default true;
  create table if not exists media_parts (
    media_id uuid not null references media(id) on delete cascade,
    idx      integer not null,
    data     bytea not null,
    primary key (media_id, idx)
  );
  alter table groups add column if not exists inject jsonb;
  alter table screens add column if not exists audio_state text;
  alter table screens add column if not exists audio_at timestamptz;
`;

let ensured: Promise<void> | null = null;

export function ensureMediaSchema(): Promise<void> {
  if (!ensured) {
    ensured = query(SCHEMA).then(
      () => undefined,
      (e) => {
        ensured = null; // retry on the next request
        throw e;
      },
    );
  }
  return ensured;
}

const AUDIO_EXT: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4', // video/mp4 too — only the soundtrack is played
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  flac: 'audio/flac',
  weba: 'audio/webm',
};

/** Browsers (notably on Windows) sometimes send an empty type — fall back to the extension. */
export function audioMime(type: string, filename: string): string | null {
  if (type.startsWith('audio/')) return type;
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return AUDIO_EXT[ext] ?? null;
}
