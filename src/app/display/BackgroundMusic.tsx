'use client';
import { useEffect, useRef, type MutableRefObject } from 'react';
import type { AudioState, InjectCommand } from '@/lib/screen';

/**
 * 24/7 background music for the kiosk display. Reads the `music` block from
 * /api/display/content, plays tracks in a loop (optionally shuffled), and caches
 * every track as a Blob in IndexedDB so playback continues with no internet.
 *
 * Autoplay: the kiosk launches Chrome with
 *   --autoplay-policy=no-user-gesture-required
 * so playback starts immediately. In a normal browser we also start on the first
 * user gesture as a fallback.
 */

const DB_NAME = 'SignageAudioCache';
const STORE = 'tracks';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function cacheGet(url: string): Promise<Blob | null> {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const rq = db.transaction(STORE).objectStore(STORE).get(url);
      rq.onsuccess = () => resolve((rq.result as Blob) || null);
      rq.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function cachePut(url: string, blob: Blob): Promise<void> {
  try {
    const db = await openDB();
    db.transaction(STORE, 'readwrite').objectStore(STORE).put(blob, url);
  } catch {
    /* ignore quota/errors — playback still works online */
  }
}

interface Track {
  id: string;
  url: string;
  filename: string;
  mime?: string;
  parts?: number;
}

async function fetchBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  return res.blob();
}

/** Ensure the track is cached (no object URL created). Used for prefetch too.
 *  Large tracks come in parts (each response must stay under Vercel's 4.5 MB cap). */
async function cacheEnsure(track: Track): Promise<Blob | null> {
  let blob = await cacheGet(track.url);
  if (!blob) {
    if (track.parts) {
      const pieces: Blob[] = [];
      for (let i = 0; i < track.parts; i++) {
        // eslint-disable-next-line no-await-in-loop
        pieces.push(await fetchBlob(`${track.url}?part=${i}`));
      }
      blob = new Blob(pieces, { type: track.mime || 'audio/mpeg' });
    } else {
      blob = await fetchBlob(track.url);
    }
    await cachePut(track.url, blob);
  }
  return blob;
}

// A joining/reloading screen this far behind the shared timeline seeks to catch up;
// closer than that it starts from the PLAY position so nobody misses the opening.
const INJECT_CATCH_UP_SEC = 8;

export function BackgroundMusic({
  boardId,
  inject = null,
  clockSkew,
  onState,
}: {
  boardId: string;
  /** Admin "audio injection": while playing it replaces the background song. */
  inject?: InjectCommand | null;
  clockSkew?: MutableRefObject<number>;
  /** Reports what the speakers are doing, for the admin screen list + the unmute prompt. */
  onState?: (s: AudioState) => void;
}) {
  const injectRef = useRef(inject);
  const applyInjectRef = useRef<() => void>();
  const onStateRef = useRef(onState);
  onStateRef.current = onState;

  useEffect(() => {
    if (!boardId) return;
    const audio = new Audio();
    audio.loop = false;
    audio.preload = 'auto';
    const injectAudio = new Audio();
    injectAudio.preload = 'auto';

    const st: {
      tracks: Track[];
      order: number[];
      idx: number;
      cfg: { enabled?: boolean; volume?: number; shuffle?: boolean; loop?: boolean };
      objUrl?: string;
      stopped: boolean;
      injecting: boolean; // background is paused for an injected track
      injectRun: string | null; // mediaId:startedAt of the PLAY being (or already) handled
      injectMedia: string | null; // mediaId loaded into injectAudio
      injectObjUrl?: string;
      state: AudioState | null;
    } = {
      tracks: [], order: [], idx: 0, cfg: {}, stopped: false,
      injecting: false, injectRun: null, injectMedia: null, state: null,
    };

    const volume = () => (typeof st.cfg.volume === 'number' ? st.cfg.volume : 0.6);

    const report = (s: AudioState) => {
      if (s === st.state) return;
      st.state = s;
      onStateRef.current?.(s);
    };
    /** Autoplay is only allowed after a user gesture outside the kiosk — tell the shell to ask. */
    const blocked = (e: unknown) => (e as DOMException)?.name === 'NotAllowedError';

    const shuffleOrder = (n: number, shuffle: boolean) => {
      const a = Array.from({ length: n }, (_, i) => i);
      if (shuffle) {
        for (let i = n - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
      }
      return a;
    };

    async function playCurrent() {
      if (st.stopped || st.injecting || !st.tracks.length) return;
      if (st.idx >= st.order.length) {
        if (st.cfg.loop !== false) {
          st.order = shuffleOrder(st.tracks.length, st.cfg.shuffle !== false);
          st.idx = 0;
        } else {
          return;
        }
      }
      const track = st.tracks[st.order[st.idx]];
      try {
        const blob = await cacheEnsure(track);
        if (st.stopped || st.injecting || !blob) return;
        if (st.objUrl) URL.revokeObjectURL(st.objUrl);
        st.objUrl = URL.createObjectURL(blob);
        audio.src = st.objUrl;
        audio.volume = volume();
        await audio.play();
        report('playing');
      } catch (e) {
        if (st.injecting) return; // paused on purpose, not a broken track
        // Sound not allowed yet: keep this track loaded and wait for a gesture / the
        // watchdog — skipping tracks here would race through the whole playlist in silence.
        if (blocked(e)) {
          report('blocked');
          return;
        }
        // couldn't load/decode this one — skip to next shortly
        window.setTimeout(() => {
          st.idx += 1;
          playCurrent();
        }, 1500);
      }
    }

    const onEnded = () => {
      st.idx += 1;
      playCurrent();
    };
    audio.addEventListener('ended', onEnded);

    /** Back to the background song, from exactly where the injection paused it. */
    function resumeBackground() {
      if (st.stopped || !st.cfg.enabled || !st.tracks.length) {
        report('off');
        return;
      }
      if (audio.src && !audio.ended) {
        audio.volume = volume();
        audio.play().then(
          () => report('playing'),
          (e) => report(blocked(e) ? 'blocked' : 'error'),
        );
      } else {
        playCurrent();
      }
    }

    function stopInject() {
      st.injectRun = null;
      if (!st.injecting) return;
      st.injecting = false;
      injectAudio.pause();
      resumeBackground();
    }

    const onInjectEnded = () => {
      // keep injectRun so this same PLAY isn't replayed by the next status poll
      st.injecting = false;
      resumeBackground();
    };
    injectAudio.addEventListener('ended', onInjectEnded);

    async function applyInject() {
      const cmd = injectRef.current;
      if (st.stopped) return;
      if (!cmd) {
        stopInject();
        return;
      }
      const track: Track = { id: cmd.mediaId, url: cmd.url, filename: '', mime: cmd.mime, parts: cmd.parts };
      if (!cmd.playing || !cmd.startedAt) {
        stopInject();
        cacheEnsure(track).catch(() => {}); // preload so PLAY starts instantly
        return;
      }
      const run = `${cmd.mediaId}:${cmd.startedAt}`;
      if (st.injectRun === run) return; // already playing / already finished this PLAY
      st.injectRun = run;

      // pause the background right away — remembers its position for resumeBackground()
      st.injecting = true;
      audio.pause();
      try {
        if (st.injectMedia !== cmd.mediaId) {
          const blob = await cacheEnsure(track);
          if (st.injectRun !== run || !blob) return;
          if (st.injectObjUrl) URL.revokeObjectURL(st.injectObjUrl);
          st.injectObjUrl = URL.createObjectURL(blob);
          injectAudio.src = st.injectObjUrl;
          st.injectMedia = cmd.mediaId;
          await new Promise<void>((resolve, reject) => {
            if (injectAudio.readyState >= 1) return resolve();
            injectAudio.addEventListener('loadedmetadata', () => resolve(), { once: true });
            injectAudio.addEventListener('error', () => reject(new Error('decode')), { once: true });
          });
          if (st.injectRun !== run) return;
        }
        // where the shared timeline is now (server clock), e.g. for a screen that just booted
        const serverNow = Date.now() + (clockSkew?.current ?? 0);
        const position = cmd.offset + Math.max(0, (serverNow - cmd.startedAt) / 1000);
        let target = position - cmd.offset > INJECT_CATCH_UP_SEC ? position : cmd.offset;
        // PLAY after PAUSE on this screen: continue from where IT stopped. The server's
        // offset runs a few seconds ahead (commands arrive up to one poll late), which
        // would skip part of the track.
        const local = injectAudio.currentTime;
        if (target === cmd.offset && !injectAudio.ended && local > 0 && Math.abs(local - cmd.offset) < 10) {
          target = local;
        }
        if (Number.isFinite(injectAudio.duration) && target >= injectAudio.duration - 0.25) {
          onInjectEnded(); // that PLAY already finished
          return;
        }
        injectAudio.currentTime = target;
        injectAudio.volume = volume();
        await injectAudio.play();
        report('injecting');
      } catch (e) {
        // autoplay blocked (not a kiosk): stay injected, the first tap starts it (unlock)
        if (blocked(e)) {
          report('inject-blocked');
          return;
        }
        // can't load/play the injected file — don't leave the screen silent
        if (st.injectRun === run) onInjectEnded();
      }
    }
    applyInjectRef.current = () => {
      applyInject();
    };

    // Retry whatever should be sounding right now. Runs on every user gesture (which is what
    // lifts a browser's autoplay block) and on a watchdog, so a screen that boots before the
    // network is up, or wakes from sleep, starts playing on its own instead of staying silent.
    const kick = () => {
      if (st.stopped) return;
      if (st.injecting) {
        if (injectAudio.paused && injectAudio.src) {
          injectAudio.play().then(
            () => report('injecting'),
            (e) => report(blocked(e) ? 'inject-blocked' : 'error'),
          );
        }
        return;
      }
      if (!st.cfg.enabled || !st.tracks.length) {
        report('off');
        return;
      }
      if (!audio.paused) {
        report('playing');
        return;
      }
      if (audio.src && !audio.ended) {
        audio.play().then(
          () => report('playing'),
          (e) => report(blocked(e) ? 'blocked' : 'error'),
        );
      } else {
        playCurrent();
      }
    };
    const unlock = () => kick();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock);
    const watchdog = window.setInterval(kick, 5000);

    async function refresh() {
      try {
        const res = await fetch(
          `/api/display/content?boardId=${encodeURIComponent(boardId)}&t=${Date.now()}`,
          { cache: 'no-store' },
        );
        if (!res.ok) return;
        const data = await res.json();
        const m = data.music || {};
        st.cfg = m;
        audio.volume = volume();
        injectAudio.volume = volume();

        const tracks: Track[] = Array.isArray(m.tracks) ? m.tracks : [];
        if (!m.enabled || tracks.length === 0) {
          st.tracks = [];
          audio.pause();
          report('off');
          return;
        }
        const prevKey = st.tracks.map((t) => t.id).join(',');
        const newKey = tracks.map((t) => t.id).join(',');
        // during an injection the background stays paused (and keeps its place); a changed
        // playlist is picked up by the first refresh after it.
        if (!st.injecting && (newKey !== prevKey || audio.paused)) {
          st.tracks = tracks;
          st.order = shuffleOrder(tracks.length, m.shuffle !== false);
          st.idx = 0;
          playCurrent();
        }
        // prefetch all tracks for offline resilience
        tracks.forEach((t) => cacheEnsure(t).catch(() => {}));
      } catch {
        /* offline: keep playing whatever is loaded */
      }
    }

    refresh().then(() => applyInject());
    const poll = window.setInterval(refresh, 30_000);

    return () => {
      st.stopped = true;
      applyInjectRef.current = undefined;
      window.clearInterval(poll);
      window.clearInterval(watchdog);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
      audio.removeEventListener('ended', onEnded);
      injectAudio.removeEventListener('ended', onInjectEnded);
      audio.pause();
      injectAudio.pause();
      if (st.objUrl) URL.revokeObjectURL(st.objUrl);
      if (st.injectObjUrl) URL.revokeObjectURL(st.injectObjUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  useEffect(() => {
    injectRef.current = inject;
    applyInjectRef.current?.();
  }, [inject]);

  return null;
}
