'use client';
import { useEffect, useRef, useState } from 'react';
import { apiGet, apiSend, ApiError } from '@/lib/api-client';
import { uploadAudio } from '@/lib/chunked-upload';

// "Audio injection" — password-gated. PLAY interrupts the background music on every screen
// in the group with the selected track; PAUSE returns to the background song exactly where
// it stopped. Commands reach the screens through their 5s status poll.

interface InjectMedia {
  id: string;
  filename: string;
  size_bytes: number;
  duration: number | null;
}
interface InjectState {
  mediaId: string | null;
  playing: boolean;
  startedAt: number | null;
  offset: number;
}

const AUDIO_TEXT: Record<string, string> = {
  playing: '🔊 מנגן',
  injecting: '🎙️ הזרקה',
  blocked: '🔇 חסום',
  'inject-blocked': '🔇 חסום',
  off: '🔈 כבוי',
  error: '⚠️ תקלה',
};

/** Live sound readout for this group's screens — confirms PLAY actually reached the TVs. */
function ScreenSound({ groupId }: { groupId: string }) {
  const [rows, setRows] = useState<{ id: string; name: string | null; audio: string | null }[]>([]);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const s = await apiGet('/api/screens');
        if (stop) return;
        setRows(
          (s.screens as any[])
            .filter((x) => String(x.group_id) === String(groupId) && x.online)
            .map((x) => ({ id: x.id, name: x.name, audio: x.audio_state })),
        );
      } catch {
        /* keep the last reading */
      }
    };
    load();
    const t = window.setInterval(load, 5000);
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, [groupId]);

  return (
    <div className="small muted" style={{ marginTop: 10 }}>
      {rows.length === 0
        ? 'אין מסכים מחוברים בקבוצה הזו.'
        : rows.map((r) => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span>📺 {r.name || r.id.slice(0, 8).toUpperCase()}</span>
              <span>{r.audio ? AUDIO_TEXT[r.audio] || r.audio : '…'}</span>
            </div>
          ))}
    </div>
  );
}

function fmt(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function InjectPanel({ groupId, show }: { groupId: string; show: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pwErr, setPwErr] = useState('');
  const [media, setMedia] = useState<InjectMedia[]>([]);
  const [state, setState] = useState<InjectState | null>(null);
  const [upload, setUpload] = useState('');
  const [, setTick] = useState(0);
  const skew = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const headers = { 'x-inject-password': password };

  async function call(body: Record<string, unknown>) {
    const res = await apiSend(`/api/groups/${groupId}/inject`, 'POST', body, headers);
    skew.current = res.serverNow - Date.now();
    setMedia(res.media || []);
    setState(res.state);
    return res;
  }

  async function unlock(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setPwErr('');
    try {
      await call({ action: 'unlock' });
      setUnlocked(true);
    } catch (err) {
      setPwErr(err instanceof ApiError ? err.message : 'שגיאה');
    } finally {
      setBusy(false);
    }
  }

  async function act(body: Record<string, unknown>, ok?: string) {
    setBusy(true);
    try {
      await call(body);
      if (ok) show(ok);
    } catch (err) {
      show(err instanceof ApiError ? err.message : 'שגיאה');
    } finally {
      setBusy(false);
    }
  }

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!f) return;
    setUpload('0%');
    try {
      const m = await uploadAudio(groupId, f, {
        kind: 'inject',
        headers,
        onProgress: (p) => setUpload(`${p}%`),
      });
      await call({ action: 'select', mediaId: m.id });
      show('הקובץ הועלה ונבחר ✓');
    } catch (err) {
      show(err instanceof ApiError ? err.message : 'העלאה נכשלה');
    } finally {
      setUpload('');
    }
  }

  async function remove(m: InjectMedia) {
    if (!confirm(`למחוק את "${m.filename}"?`)) return;
    setBusy(true);
    try {
      await apiSend(`/api/media/${m.id}`, 'DELETE');
      await call({ action: 'unlock' });
    } catch (err) {
      show(err instanceof ApiError ? err.message : 'מחיקה נכשלה');
    } finally {
      setBusy(false);
    }
  }

  // live position while playing
  const playing = !!state?.playing;
  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => setTick((n) => n + 1), 500);
    return () => window.clearInterval(t);
  }, [playing]);

  if (!open) {
    return (
      <>
        <div className="section-title">הזרקת שמע</div>
        <button type="button" className="btn btn-ghost btn-block" onClick={() => setOpen(true)}>
          🎙️ הזרקת שמע למסכים
        </button>
        <div style={{ height: 90 }} />
      </>
    );
  }

  if (!unlocked) {
    return (
      <>
        <div className="section-title">הזרקת שמע</div>
        <form className="card" onSubmit={unlock}>
          <div className="field">
            <label>סיסמה</label>
            <input
              type="password"
              dir="ltr"
              autoFocus
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {pwErr && <div className="hint" style={{ color: 'var(--danger)' }}>{pwErr}</div>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy || !password}>
              {busy ? 'בודק…' : 'פתח'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => { setOpen(false); setPwErr(''); }}>
              ביטול
            </button>
          </div>
        </form>
        <div style={{ height: 90 }} />
      </>
    );
  }

  const selected = media.find((m) => m.id === state?.mediaId) || null;
  const duration = selected?.duration ?? null;
  let position = state?.offset ?? 0;
  if (state?.playing && state.startedAt) position += (Date.now() + skew.current - state.startedAt) / 1000;
  const finished = !!duration && position >= duration - 0.5;
  if (duration) position = Math.min(position, duration);
  const live = playing && !finished;

  return (
    <>
      <div className="section-title">הזרקת שמע</div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 700 }}>🎙️ הזרקת שמע</div>
            <div className="small muted">PLAY עוצר את המוזיקה במסכים ומשמיע את הקובץ. PAUSE חוזר לשיר מהמקום שבו נעצר.</div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => { setUnlocked(false); setOpen(false); setPassword(''); }}
          >
            🔒 נעל
          </button>
        </div>

        <div className="list">
          {media.map((m) => {
            const isSel = m.id === state?.mediaId;
            return (
              <div
                className="rowcard"
                key={m.id}
                onClick={() => !isSel && !busy && act({ action: 'select', mediaId: m.id })}
                style={{ cursor: 'pointer', outline: isSel ? '2px solid var(--navy)' : undefined }}
              >
                <div className="avatar">{isSel ? '🔊' : '🎧'}</div>
                <div className="grow">
                  <div className="title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.filename}
                  </div>
                  <div className="meta">
                    {m.duration ? `${fmt(m.duration)} · ` : ''}
                    {(m.size_bytes / 1048576).toFixed(1)}MB{isSel ? ' · נבחר' : ''}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={(e) => { e.stopPropagation(); remove(m); }}
                >
                  מחק
                </button>
              </div>
            );
          })}
          {media.length === 0 && <div className="empty small">עוד לא הועלה קובץ להזרקה.</div>}
        </div>

        <input ref={fileRef} type="file" accept="audio/*,video/mp4,.mp4" hidden onChange={pick} />
        <button
          type="button"
          className="btn btn-ghost btn-block"
          style={{ marginTop: 10 }}
          disabled={!!upload}
          onClick={() => fileRef.current?.click()}
        >
          {upload ? `מעלה… ${upload}` : '＋ העלה קובץ להזרקה'}
        </button>

        {selected && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span className={`chip ${live ? 'chip-danger' : 'chip-off'}`}>
                <span className="dot" />
                {live ? 'משודר עכשיו במסכים' : finished ? 'הסתיים — המוזיקה חזרה' : 'מושהה — המוזיקה הרגילה מתנגנת'}
              </span>
              <span className="small muted" dir="ltr">
                {fmt(position)}{duration ? ` / ${fmt(duration)}` : ''}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1, fontSize: 18 }}
                disabled={busy || live}
                onClick={() => act({ action: 'play' }, 'PLAY נשלח — המסכים יעברו תוך כמה שניות')}
              >
                ▶ PLAY
              </button>
              <button
                type="button"
                className="btn btn-danger"
                style={{ flex: 1, fontSize: 18 }}
                disabled={busy || !live}
                onClick={() => act({ action: 'pause' }, 'PAUSE נשלח — המוזיקה חוזרת מהמקום שנעצרה')}
              >
                ⏸ PAUSE
              </button>
            </div>
            <div className="hint small muted" style={{ marginTop: 8 }}>
              המסכים מגיבים תוך עד 5 שניות.
            </div>
            <ScreenSound groupId={groupId} />
          </div>
        )}
      </div>
      <div style={{ height: 90 }} />
    </>
  );
}
