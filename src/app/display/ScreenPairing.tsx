'use client';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

// Fullscreen pairing screen shown on the TV until an admin claims it.
export function ScreenPairing({ screenId }: { screenId: string }) {
  const [qr, setQr] = useState('');

  useEffect(() => {
    if (!screenId) return;
    // When the board is served locally (localhost), window.location.origin is unreachable from a
    // phone. Point the pairing QR at the public admin (same Neon DB) so it can be scanned + claimed.
    const base = (process.env.NEXT_PUBLIC_ADMIN_ORIGIN || window.location.origin).replace(/\/$/, '');
    const url = `${base}/admin/claim?screen=${screenId}`;
    QRCode.toDataURL(url, { width: 420, margin: 1, color: { dark: '#1c4080', light: '#ffffff' } })
      .then(setQr)
      .catch(() => {});
  }, [screenId]);

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(160deg, #dcefe3, #bbdfc5)',
        color: '#1c4080',
        fontFamily: "'Ploni ML v2 AAA-Regular', -apple-system, 'Segoe UI', Arial, sans-serif",
        direction: 'rtl',
        gap: 28,
        padding: 40,
        boxSizing: 'border-box',
      }}
    >
      <style>{`
        @font-face{font-family:'Ploni ML v2 AAA-Regular';src:url('/welcome1/fonts/ploni-regular-aaa.ttf') format('truetype');font-weight:400}
        @font-face{font-family:'Ploni ML v2 AAA-Bold';src:url('/welcome1/fonts/ploni-bold-aaa.ttf') format('truetype');font-weight:700}
        @keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}
      `}</style>

      <div style={{ fontFamily: "'Ploni ML v2 AAA-Bold'", fontSize: 'clamp(28px, 4vw, 52px)', fontWeight: 700 }}>
        שיוך מסך חדש
      </div>
      <div style={{ fontSize: 'clamp(16px, 2vw, 26px)', opacity: 0.8, maxWidth: 720, textAlign: 'center', lineHeight: 1.5 }}>
        סרקו את הקוד עם הטלפון, התחברו כמנהל, ובחרו לאיזו קבוצה לשייך את המסך.
      </div>

      <div
        style={{
          background: '#fff',
          borderRadius: 28,
          padding: 24,
          boxShadow: '0 12px 48px rgba(28,64,128,0.18)',
        }}
      >
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt="QR" style={{ width: 'min(42vh, 420px)', height: 'min(42vh, 420px)', display: 'block' }} />
        ) : (
          <div style={{ width: 320, height: 320 }} />
        )}
      </div>

      <div style={{ fontSize: 'clamp(14px, 1.6vw, 22px)', opacity: 0.7 }}>
        <span style={{ animation: 'pulse 1.6s ease-in-out infinite' }}>● </span>
        ממתין לשיוך…&nbsp;&nbsp;<span style={{ letterSpacing: 2 }}>קוד: {screenId.slice(0, 8).toUpperCase()}</span>
      </div>
    </div>
  );
}
