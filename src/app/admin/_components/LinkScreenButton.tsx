'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiSend, ApiError } from '@/lib/api-client';
import { parseScreenIdFromScan } from '@/lib/parse-screen-claim';
import { Banner, Sheet } from './ui';

interface GroupOption {
  id: number;
  name: string;
}

interface LinkScreenButtonProps {
  groups: GroupOption[];
  onLinked?: () => void;
  onToast?: (message: string) => void;
  className?: string;
  block?: boolean;
}

export function LinkScreenButton({ groups, onLinked, onToast, className, block }: LinkScreenButtonProps) {
  const [open, setOpen] = useState(false);
  const [groupId, setGroupId] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const claimingRef = useRef(false);
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null);

  useEffect(() => {
    if (groups[0] && !groupId) setGroupId(String(groups[0].id));
  }, [groups, groupId]);

  const stopScanner = useCallback(async () => {
    const s = scannerRef.current;
    scannerRef.current = null;
    if (s) await s.stop().catch(() => {});
  }, []);

  const claimScreen = useCallback(
    async (screenId: string) => {
      if (claimingRef.current || busy) return;
      const gid = Number(groupId);
      if (!Number.isInteger(gid) || gid <= 0) {
        setErr('בחר קבוצה לשיוך');
        return;
      }
      claimingRef.current = true;
      setBusy(true);
      setErr('');
      await stopScanner();
      try {
        await apiSend(`/api/screens/${screenId}/claim`, 'POST', { groupId: gid });
        const gname = groups.find((g) => g.id === gid)?.name || '';
        setDone(gname);
        onToast?.(`המסך שויך ל״${gname}״ ✓`);
        onLinked?.();
      } catch (e) {
        setErr(e instanceof ApiError ? e.message : 'השיוך נכשל');
        claimingRef.current = false;
        setBusy(false);
      }
    },
    [busy, groupId, groups, onLinked, onToast, stopScanner],
  );

  const onScan = useCallback(
    (decoded: string) => {
      const screenId = parseScreenIdFromScan(decoded);
      if (!screenId) {
        setErr('קוד QR לא תקין — סרוק את הקוד מהטלוויזיה');
        return;
      }
      claimScreen(screenId);
    },
    [claimScreen],
  );

  useEffect(() => {
    if (!open || done || busy) return;
    let cancelled = false;

    (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled) return;
        const scanner = new Html5Qrcode('link-screen-qr');
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 260, height: 260 }, aspectRatio: 1 },
          (text) => {
            if (!claimingRef.current) onScan(text);
          },
          () => {},
        );
      } catch {
        if (!cancelled) setErr('לא ניתן לפתוח מצלמה — אשר גישה בהגדרות הדפדפן');
      }
    })();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [open, done, busy, onScan, stopScanner]);

  function close() {
    stopScanner();
    setOpen(false);
    setErr('');
    setDone('');
    setBusy(false);
    claimingRef.current = false;
  }

  if (!groups.length) return null;

  return (
    <>
      <button
        type="button"
        className={className || `btn btn-primary${block ? ' btn-block' : ''}`}
        onClick={() => setOpen(true)}
      >
        📷 קישור מסך
      </button>

      {open && (
        <Sheet title="קישור מסך" onClose={close}>
          {done ? (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <div style={{ fontSize: 48 }}>✅</div>
              <p style={{ fontWeight: 700, margin: '12px 0 6px' }}>המסך שויך לקבוצה ״{done}״</p>
              <p className="small muted">הלוח בטלוויזיה יתעדכן תוך מספר שניות.</p>
              <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 16 }} onClick={close}>
                סגור
              </button>
            </div>
          ) : (
            <>
              {err && <Banner kind="err">{err}</Banner>}
              <p className="small muted" style={{ marginTop: 0 }}>
                כוון את המצלמה לקוד QR על הטלוויזיה — השיוך יתבצע אוטומטית.
              </p>
              <div className="field">
                <label>שייך לקבוצה</label>
                <select value={groupId} onChange={(e) => setGroupId(e.target.value)} disabled={busy}>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
              <div id="link-screen-qr" className="qr-scanner" />
              {busy && <p className="small muted" style={{ textAlign: 'center' }}>משייך מסך…</p>}
            </>
          )}
        </Sheet>
      )}
    </>
  );
}
