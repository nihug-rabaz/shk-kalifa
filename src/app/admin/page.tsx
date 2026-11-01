'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiSend, ApiError } from '@/lib/api-client';
import { AuthGate } from './_components/AuthGate';
import { AppBar } from './_components/AppBar';
import { LinkScreenButton } from './_components/LinkScreenButton';
import { Spinner, Banner, Sheet, EmptyState, useToast } from './_components/ui';

interface GroupRow {
  id: number;
  name: string;
  slug: string;
  screen_count: string;
}
interface ScreenRow {
  id: string;
  online: boolean;
  paired: boolean;
}

function Dashboard() {
  const router = useRouter();
  const { show, node } = useToast();
  const [groups, setGroups] = useState<GroupRow[] | null>(null);
  const [screens, setScreens] = useState<ScreenRow[] | null>(null);
  const [err, setErr] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setErr('');
    try {
      const [g, s] = await Promise.all([apiGet('/api/groups'), apiGet('/api/screens')]);
      setGroups(g.groups);
      setScreens(s.screens);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'שגיאה בטעינה');
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function createGroup() {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const res = await apiSend('/api/groups', 'POST', { name: newName.trim() });
      setCreating(false);
      setNewName('');
      router.push(`/admin/groups/${res.group.id}`);
    } catch (e) {
      show(e instanceof ApiError ? e.message : 'שגיאה');
      setBusy(false);
    }
  }

  async function logout() {
    await apiSend('/api/auth/logout', 'POST').catch(() => {});
    router.replace('/admin/login');
  }

  if (!groups || !screens) {
    return (
      <>
        <AppBar title="ניהול לוחות" />
        <Spinner />
      </>
    );
  }

  const online = screens.filter((s) => s.online).length;

  return (
    <>
      <AppBar
        title="ניהול לוחות"
        right={
          <button className="iconbtn" onClick={logout} aria-label="התנתקות" title="התנתקות">
            ⎋
          </button>
        }
      />
      <div className="container">
        {err && <Banner kind="err">{err}</Banner>}

        <a className="rowcard" href="/admin/screens" style={{ marginBottom: 16 }}>
          <div className="avatar">📺</div>
          <div className="grow">
            <div className="title">מסכים</div>
            <div className="meta">
              {screens.length} מסכים · {online} מחוברים כעת
            </div>
          </div>
          <div className="chev">‹</div>
        </a>

        {groups.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <LinkScreenButton groups={groups} onLinked={load} onToast={show} block />
          </div>
        )}

        <div className="section-title">קבוצות מסכים</div>
        {groups.length === 0 ? (
          <EmptyState icon="🗂️" title="אין עדיין קבוצות" hint="צור קבוצה ראשונה, למשל ״בניין A״" />
        ) : (
          <div className="list">
            {groups.map((g) => (
              <a key={g.id} className="rowcard" href={`/admin/groups/${g.id}`}>
                <div className="avatar">{g.name.trim().charAt(0) || '?'}</div>
                <div className="grow">
                  <div className="title">{g.name}</div>
                  <div className="meta">{Number(g.screen_count)} מסכים משויכים</div>
                </div>
                <div className="chev">‹</div>
              </a>
            ))}
          </div>
        )}
      </div>

      <button className="fab" onClick={() => setCreating(true)}>
        ＋ קבוצה חדשה
      </button>

      {creating && (
        <Sheet title="קבוצה חדשה" onClose={() => setCreating(false)}>
          <div className="field">
            <label>שם הקבוצה</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="לדוגמה: בניין A"
              autoFocus
            />
            <div className="hint">כל המסכים שתשייך לקבוצה יציגו את אותו הלוח.</div>
          </div>
          <button className="btn btn-primary btn-block" disabled={busy || !newName.trim()} onClick={createGroup}>
            {busy ? 'יוצר…' : 'צור קבוצה'}
          </button>
        </Sheet>
      )}
      {node}
    </>
  );
}

export default function Page() {
  return (
    <AuthGate>
      <Dashboard />
    </AuthGate>
  );
}
