'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiGet, apiSend, ApiError } from '@/lib/api-client';
import { AuthGate } from '../_components/AuthGate';
import { AppBar } from '../_components/AppBar';
import { Spinner, Banner } from '../_components/ui';

interface GroupRow {
  id: number;
  name: string;
}

function ClaimInner() {
  const params = useSearchParams();
  const router = useRouter();
  const screen = params.get('screen') || '';
  const [groups, setGroups] = useState<GroupRow[] | null>(null);
  const [groupId, setGroupId] = useState<string>('');
  const [newName, setNewName] = useState('');
  const [screenName, setScreenName] = useState(params.get('name') || '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    apiGet('/api/groups')
      .then((g) => {
        setGroups(g.groups);
        if (g.groups[0]) setGroupId(String(g.groups[0].id));
      })
      .catch((e) => setErr(e instanceof ApiError ? e.message : 'שגיאה'));
  }, []);

  const valid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(screen);

  async function claim() {
    setBusy(true);
    setErr('');
    try {
      let gid = groupId ? Number(groupId) : 0;
      let gname = groups?.find((g) => g.id === gid)?.name || '';
      if (groupId === '__new__') {
        if (!newName.trim()) {
          setErr('הזן שם קבוצה');
          setBusy(false);
          return;
        }
        const res = await apiSend('/api/groups', 'POST', { name: newName.trim() });
        gid = res.group.id;
        gname = res.group.name;
      }
      await apiSend(`/api/screens/${screen}/claim`, 'POST', { groupId: gid, name: screenName || null });
      setDone(gname);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'השיוך נכשל');
      setBusy(false);
    }
  }

  if (!valid) {
    return (
      <>
        <AppBar title="שיוך מסך" back="/admin" />
        <div className="container">
          <Banner kind="err">קוד המסך אינו תקין. סרוק שוב את ה-QR מהטלוויזיה.</Banner>
        </div>
      </>
    );
  }

  if (done) {
    return (
      <>
        <AppBar title="שיוך מסך" back="/admin" />
        <div className="container">
          <div className="card" style={{ textAlign: 'center', padding: 32 }}>
            <div style={{ fontSize: 52 }}>✅</div>
            <h2 style={{ marginTop: 10 }}>המסך שויך לקבוצה ״{done}״</h2>
            <p className="muted small">הלוח בטלוויזיה יתחיל להציג את התוכן תוך מספר שניות.</p>
            <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} onClick={() => router.replace('/admin')}>
              חזרה לניהול
            </button>
          </div>
        </div>
      </>
    );
  }

  if (!groups) {
    return (
      <>
        <AppBar title="שיוך מסך" back="/admin" />
        <Spinner />
      </>
    );
  }

  return (
    <>
      <AppBar title="שיוך מסך חדש" back="/admin" />
      <div className="container">
        {err && <Banner kind="err">{err}</Banner>}
        <div className="card">
          <p className="small muted" style={{ marginTop: 0 }}>
            סרקת מסך חדש. בחר לאיזו קבוצה לשייך אותו — כל המסכים בקבוצה מציגים את אותו לוח.
          </p>
          <div className="field">
            <label>שם למסך (אופציונלי)</label>
            <input value={screenName} onChange={(e) => setScreenName(e.target.value)} placeholder="לדוגמה: לובי קומה 1" />
          </div>
          <div className="field" style={{ marginBottom: groupId === '__new__' ? 12 : 0 }}>
            <label>קבוצה</label>
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
              <option value="__new__">➕ קבוצה חדשה…</option>
            </select>
          </div>
          {groupId === '__new__' && (
            <div className="field" style={{ marginBottom: 0 }}>
              <label>שם הקבוצה החדשה</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="בניין A" autoFocus />
            </div>
          )}
        </div>
        <button className="btn btn-primary btn-block" disabled={busy} onClick={claim}>
          {busy ? 'משייך…' : 'שייך מסך'}
        </button>
      </div>
    </>
  );
}

export default function Page() {
  return (
    <AuthGate>
      <Suspense fallback={<Spinner />}>
        <ClaimInner />
      </Suspense>
    </AuthGate>
  );
}
