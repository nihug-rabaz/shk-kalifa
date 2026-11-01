-- Digital signage system — Neon Postgres schema
-- Single organization, many GROUPS of screens (e.g. "בניין A").
-- Content is keyed by group; every screen in a group shows the same board.

create extension if not exists pgcrypto;

-- ── Admins (managers who log in from the phone) ─────────────────────────────
create table if not exists admins (
  id            serial primary key,
  username      text not null unique,
  password_hash text not null,
  display_name  text,
  role          text not null default 'admin',
  created_at    timestamptz not null default now()
);

-- ── Groups of screens ───────────────────────────────────────────────────────
-- location: { label, latitude, longitude, elevation, timezone }  (used for zmanim)
-- theme:    { primaryHex, gradient: [c1, c2] }
-- music:    { enabled, volume(0..1), shuffle, loop }
create table if not exists groups (
  id           serial primary key,
  name         text not null,
  slug         text not null unique,
  display_name text,                                   -- board title (defaults to org name)
  location     jsonb not null default '{}'::jsonb,
  theme        jsonb not null default '{}'::jsonb,
  music        jsonb not null default '{"enabled":false,"volume":0.6,"shuffle":true,"loop":true}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
-- for databases created before display_name existed:
alter table groups add column if not exists display_name text;

-- ── Screens (each physical TV). id is minted client-side (uuid). ────────────
create table if not exists screens (
  id          uuid primary key default gen_random_uuid(),
  name        text,
  group_id    integer references groups(id) on delete set null,
  paired      boolean not null default false,
  user_agent  text,
  ip          text,
  last_seen_at timestamptz,
  paired_at   timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists screens_group_idx on screens(group_id);

-- ── Board content, one row per group ────────────────────────────────────────
-- Mirrors the payload shape consumed by public/welcome*/board-data.js:
--   prayers[], updates[], letter{}, orders[], durations{}, additions{}, assets[]
create table if not exists board_content (
  group_id    integer primary key references groups(id) on delete cascade,
  prayers     jsonb not null default '[]'::jsonb,
  updates     jsonb not null default '[]'::jsonb,
  letter      jsonb,
  orders      jsonb not null default '[]'::jsonb,
  durations   jsonb not null default '{}'::jsonb,
  additions   jsonb not null default '{}'::jsonb,
  assets      jsonb not null default '[]'::jsonb,
  extras      jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  integer references admins(id)
);

-- ── Uploaded media (music tracks + images) stored in the DB ─────────────────
-- Served via /api/media/:id ; cached client-side (IndexedDB) for offline.
create table if not exists media (
  id          uuid primary key default gen_random_uuid(),
  group_id    integer references groups(id) on delete cascade,
  kind        text not null,                       -- 'music' | 'image'
  filename    text not null,
  mime        text not null,
  size_bytes  integer not null,
  sort_order  integer not null default 0,
  meta        jsonb not null default '{}'::jsonb,
  data        bytea not null,
  created_at  timestamptz not null default now()
);
create index if not exists media_group_kind_idx on media(group_id, kind, sort_order);

-- Large files (music) are stored in parts: Vercel caps a function body at 4.5 MB.
-- For those rows media.data is null and parts > 0; ready flips true once every
-- part has arrived. (Also applied at runtime by src/lib/media-store.ts.)
alter table media alter column data drop not null;
alter table media add column if not exists parts integer not null default 0;
alter table media add column if not exists ready boolean not null default true;
create table if not exists media_parts (
  media_id uuid not null references media(id) on delete cascade,
  idx      integer not null,
  data     bytea not null,
  primary key (media_id, idx)
);

-- Audio injection state (see src/lib/inject.ts): { mediaId, playing, startedAt, offset }
alter table groups add column if not exists inject jsonb;

-- What each screen's speakers are actually doing, reported on its status poll, so a
-- manager can see from the phone whether a TV is playing, silent, or sound-blocked.
alter table screens add column if not exists audio_state text;
alter table screens add column if not exists audio_at timestamptz;
