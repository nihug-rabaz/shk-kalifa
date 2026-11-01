'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiSend, ApiError } from '@/lib/api-client';
import { Banner } from '../_components/ui';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/admin';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await apiSend('/api/auth/login', 'POST', { username, password });
      router.replace(next);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'שגיאת התחברות');
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand">
          <div className="logo">🕎</div>
          <h1>מערכת ניהול לוחות</h1>
          <p className="sub">כניסת מנהל</p>
        </div>
        {err && <Banner kind="err">{err}</Banner>}
        <div className="field">
          <label>שם משתמש</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus />
        </div>
        <div className="field">
          <label>סיסמה</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <button className="btn btn-primary btn-block" disabled={busy || !username || !password}>
          {busy ? 'מתחבר…' : 'התחברות'}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
