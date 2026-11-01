'use client';
import { useEffect, useState } from 'react';
import { apiGet, apiSend, ApiError } from '@/lib/api-client';
import { AuthGate } from '../_components/AuthGate';
import { AppBar } from '../_components/AppBar';
import { LinkScreenButton } from '../_components/LinkScreenButton';
import { Spinner, Banner, Sheet, EmptyState, useToast } from '../_components/ui';

interface ScreenRow {
  id: string;
  name: string | null;
  group_id: number | null;
  group_name: string | null;
  online: boolean;
  paired: boolean;
  audio_state: string | null;
}

// What the TV reports about its own speakers (null = not reported in the last 90s).
const AUDIO_LABEL: Record<string, { text: string; chip: string }> = {
  playing: { text: '🔊 מנגן', chip: 'chip-ok' },
  injecting: { text: '🎙️ הזרקה מתנגנת', chip: 'chip-ok' },
  blocked: { text: '🔇 סאונד חסום — גע במסך', chip: 'chip-warn' },
  'inject-blocked': { text: '🔇 הזרקה חסומה — גע במסך', chip: 'chip-warn' },
  off: { text: '🔈 מוזיקה כבויה', chip: 'chip-off' },
  error: { text: '⚠️ תקלת שמע', chip: 'chip-danger' },
};
interface GroupRow {
  id: number;
  name: string;
}

function Screens() {
  const { show, node } = useToast();
  const [screens, setScreens] = useState<ScreenRow[] | null>(null);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState<ScreenRow | null>(null);
  const [eName, setEName] = useState('');
  const [eGroup, setEGroup] = useState<string>('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setErr('');
    try {
      const [s, g] = await Promise.all([apiGet('/api/screens'), apiGet('/api/groups')]);
      setScreens(s.screens);
      setGroups(g.groups);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'שגיאה');
    }
  }
  // The sound chips are live readings — refresh while the page is open.
  useEffect(() => {
    load();
    const t = window.setInterval(load, 10_000);
    return () => window.clearInterval(t);
  }, []);

  function openEdit(s: ScreenRow) {
    setEditing(s);
    setEName(s.name || '');
    setEGroup(s.group_id ? String(s.group_id) : '');
  }

  async function saveEdit() {
    if (!editing) return;
    setBusy(true);
    try {
      await apiSend(`/api/screens/${editing.id}`, 'PUT', {
        name: eName || null,
        groupId: eGroup ? Number(eGroup) : null,
      });
      setEditing(null);
      await load();
      show('נשמר ✓');
    } catch (e) {
      show(e instanceof ApiError ? e.message : 'שגיאה');
    } finally {
      setBusy(false);
    }
  }

  async function del() {
    if (!editing) return;
    if (!confirm('למחוק את המסך?')) return;
    setBusy(true);
    try {
      await apiSend(`/api/screens/${editing.id}`, 'DELETE');
      setEditing(null);
      await load();
    } catch (e) {
      show(e instanceof ApiError ? e.message : 'שגיאה');
    } finally {
      setBusy(false);
    }
  }

  if (!screens) {
    return (
      <>
        <AppBar title="מסכים" back="/admin" />
        <Spinner />
      </>
    );
  }

  const unpaired = screens.filter((s) => !s.paired || !s.group_id);
  const paired = screens.filter((s) => s.paired && s.group_id);

  const Row = (s: ScreenRow) => (
    <button
      key={s.id}
      className="rowcard"
      style={{ width: '100%', textAlign: 'start', border: 'none', cursor: 'pointer' }}
      onClick={() => openEdit(s)}
    >
      <div className="avatar">📺</div>
      <div className="grow">
        <div className="title">
          {s.name || 'מסך ללא שם'}{' '}
          <span className="small muted" dir="ltr" style={{ fontWeight: 400 }}>
            {s.id.slice(0, 8).toUpperCase()}
          </span>
        </div>
        <div className="meta" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span>{s.group_name ? `${s.group_name} ·` : 'לא משויך ·'}</span>
          <span className={`chip ${s.online ? 'chip-ok' : 'chip-off'}`}>
            <span className="dot" />
            {s.online ? 'מחובר' : 'לא מחובר'}
          </span>
          {s.online && s.audio_state && AUDIO_LABEL[s.audio_state] && (
            <span className={`chip ${AUDIO_LABEL[s.audio_state].chip}`}>
              {AUDIO_LABEL[s.audio_state].text}
            </span>
          )}
        </div>
      </div>
      <div className="chev">‹</div>
    </button>
  );

  return (
    <>
      <AppBar title="מסכים" back="/admin" />
      <div className="container">
        {err && <Banner kind="err">{err}</Banner>}
        {groups.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <LinkScreenButton groups={groups} onLinked={load} onToast={show} block />
          </div>
        )}
        {screens.length === 0 && (
          <EmptyState icon="📺" title="אין מסכים" hint="פתח את הלוח בטלוויזיה — הוא יופיע כאן לשיוך." />
        )}
        {unpaired.length > 0 && (
          <>
            <div className="section-title">ממתינים לשיוך ({unpaired.length})</div>
            <div className="list">{unpaired.map(Row)}</div>
          </>
        )}
        {paired.length > 0 && (
          <>
            <div className="section-title">מסכים משויכים ({paired.length})</div>
            <div className="list">{paired.map(Row)}</div>
          </>
        )}
      </div>

      {editing && (
        <Sheet title="עריכת מסך" onClose={() => setEditing(null)}>
          <div className="field">
            <label>שם המסך</label>
            <input value={eName} onChange={(e) => setEName(e.target.value)} placeholder="לדוגמה: לובי קומה 1" />
          </div>
          <div className="field">
            <label>שיוך לקבוצה</label>
            <select value={eGroup} onChange={(e) => setEGroup(e.target.value)}>
              <option value="">— ללא שיוך —</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary btn-block" disabled={busy} onClick={saveEdit}>
            {busy ? 'שומר…' : 'שמור'}
          </button>
          <button className="btn btn-danger btn-block" style={{ marginTop: 10 }} disabled={busy} onClick={del}>
            מחק מסך
          </button>
          <div className="small muted" style={{ marginTop: 12, textAlign: 'center' }}>
            מזהה: {editing.id.slice(0, 8)}…
          </div>
        </Sheet>
      )}
      {node}
    </>
  );
}

export default function Page() {
  return (
    <AuthGate>
      <Screens />
    </AuthGate>
  );
}
