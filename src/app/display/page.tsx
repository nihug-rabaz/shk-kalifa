'use client';

import { useEffect, useRef, useState } from 'react';
import { ScreenPairing } from './ScreenPairing';
import { BackgroundMusic } from './BackgroundMusic';
import {
  getScreenId,
  getCachedGroupId,
  setCachedGroupId,
  setPairingConfirmed,
  clearPairingState,
  isPairingConfirmed,
  registerScreen,
  getScreenStatus,
  unpairScreen,
  type AudioState,
  type InjectCommand,
} from '@/lib/screen';

type Phase = 'pairing' | 'display';

export default function DisplayPage() {
  const [phase, setPhase] = useState<Phase>('pairing');
  const [groupId, setGroupId] = useState('');
  const [screenId] = useState(() => (typeof window !== 'undefined' ? getScreenId() : ''));
  const [inject, setInject] = useState<InjectCommand | null>(null);
  const clockSkew = useRef(0); // server clock − local clock, for syncing injected audio
  const audioState = useRef<AudioState | undefined>(undefined); // reported on each status poll
  const [needsTap, setNeedsTap] = useState(false); // browser is holding the sound back
  const version = useRef<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('force_pairing') === '1') {
      const id = screenId || getScreenId();
      void unpairScreen(id);
      const u = new URL(window.location.href);
      u.searchParams.delete('force_pairing');
      window.history.replaceState({}, '', u.pathname + u.search);
    }
  }, []);

  useEffect(() => {
    const id = screenId || getScreenId();
    if (!id) return;

    let stopped = false;

    const applyStatus = (st: Awaited<ReturnType<typeof getScreenStatus>>) => {
      if (stopped) return;
      if (!st) {
        const cached = getCachedGroupId();
        if (cached && isPairingConfirmed()) {
          setGroupId(cached);
          setPhase('display');
        } else {
          clearPairingState();
          setGroupId('');
          setPhase('pairing');
        }
        return;
      }
      if (st.paired && st.groupId) {
        if (typeof st.serverNow === 'number') clockSkew.current = st.serverNow - Date.now();
        // A new deployment went out: this shell has been loaded for days and would otherwise
        // keep running the old code forever (only the board iframe reloads on its own).
        if (st.version) {
          if (version.current && version.current !== st.version && !st.inject?.playing) {
            window.location.reload();
            return;
          }
          version.current = st.version;
        }
        const next = st.inject ?? null;
        // keep identity stable while the command is unchanged (it's polled every 5s)
        setInject((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
        const gid = String(st.groupId);
        setCachedGroupId(gid);
        setPairingConfirmed(true);
        setGroupId(gid);
        setPhase('display');
      } else {
        clearPairingState();
        setGroupId('');
        setPhase('pairing');
      }
    };

    const check = async () => {
      await registerScreen(id);
      applyStatus(await getScreenStatus(id, audioState.current));
    };

    check();
    const iv = setInterval(check, 5000);
    return () => {
      stopped = true;
      clearInterval(iv);
    };
  }, [screenId]);

  if (phase === 'pairing' || !groupId) {
    return <ScreenPairing screenId={screenId || getScreenId()} />;
  }

  // The boards reload themselves every 15s, so they run inside an iframe while this page
  // stays put — that's what lets the background music play continuously across boards.
  // This page keeps polling the screen status above, so re-pairing / moving the screen to
  // another group swaps the iframe (src depends on groupId).
  const id = screenId || getScreenId();
  const qs = new URLSearchParams({ board: '1', board_id: groupId, kiosk: '1', screen: id });
  const purim = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('purim_test') : null;
  if (purim) qs.set('purim_test', purim);

  return (
    <>
      <iframe
        key={groupId}
        src={`/api/welcome-html?${qs.toString()}`}
        title="board"
        allow="autoplay"
        onLoad={(e) => {
          // Outside the kiosk (no autoplay flag) a tap starts the music. Taps land in the
          // iframe, so forward them; the user activation already propagates to this frame.
          const w = e.currentTarget.contentWindow;
          w?.addEventListener('pointerdown', () => window.dispatchEvent(new Event('pointerdown')));
          w?.addEventListener('keydown', () => window.dispatchEvent(new Event('keydown')));
        }}
        style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', border: 0, display: 'block' }}
      />
      <BackgroundMusic
        boardId={groupId}
        inject={inject}
        clockSkew={clockSkew}
        onState={(s) => {
          audioState.current = s;
          setNeedsTap(s === 'blocked' || s === 'inject-blocked');
        }}
      />
      {/* Kiosk Chrome autoplays, so this never shows there. In a normal browser sound needs
          one gesture — the click itself reaches the player's unlock listener on window. */}
      {needsTap && (
        <button
          type="button"
          onClick={() => setNeedsTap(false)}
          style={{
            position: 'fixed', insetInlineEnd: 20, bottom: 20, zIndex: 10,
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '14px 22px', borderRadius: 999, border: 'none', cursor: 'pointer',
            background: '#1c4080', color: '#fff', fontSize: 18, fontWeight: 700,
            fontFamily: 'inherit', boxShadow: '0 6px 24px rgba(0,0,0,0.25)',
          }}
        >
          🔊 הפעל סאונד
        </button>
      )}
    </>
  );
}
