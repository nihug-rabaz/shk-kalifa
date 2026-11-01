'use client';
import { useEffect, useState } from 'react';

// Visit /reset once on any device to forcibly remove a stuck service worker +
// all caches, then continue to the admin panel. Safe to run anytime.
export default function ResetPage() {
  const [msg, setMsg] = useState('מנקה נתונים ישנים…');

  useEffect(() => {
    (async () => {
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
      } catch {
        /* ignore */
      }
      try {
        if (typeof caches !== 'undefined') {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      } catch {
        /* ignore */
      }
      setMsg('הושלם! מעביר לניהול…');
      setTimeout(() => window.location.replace('/admin'), 900);
    })();
  }, []);

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        background: 'linear-gradient(160deg, #dcefe3, #f4f7f5)',
        color: '#1c4080',
        fontFamily: "-apple-system, 'Segoe UI', Arial, sans-serif",
        direction: 'rtl',
        padding: 24,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          border: '4px solid #dcefe3',
          borderTopColor: '#1c4080',
          borderRadius: '50%',
          animation: 'sp 0.8s linear infinite',
        }}
      />
      <div style={{ fontSize: 18, fontWeight: 700 }}>{msg}</div>
      <style>{`@keyframes sp{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
