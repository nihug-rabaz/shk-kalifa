'use client';
import { useCallback, useRef, useState } from 'react';

export function Spinner() {
  return (
    <div className="center-screen">
      <div className="spinner" />
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" />
      {label ? <span>{label}</span> : null}
    </label>
  );
}

export function Banner({ kind, children }: { kind: 'err' | 'ok'; children: React.ReactNode }) {
  return <div className={`banner banner-${kind}`}>{children}</div>;
}

export function EmptyState({ icon, title, hint }: { icon: string; title: string; hint?: string }) {
  return (
    <div className="empty">
      <div className="big">{icon}</div>
      <div style={{ fontWeight: 700 }}>{title}</div>
      {hint ? <div className="small" style={{ marginTop: 6 }}>{hint}</div> : null}
    </div>
  );
}

export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((m: string) => {
    setMsg(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), 2600);
  }, []);
  const node = msg ? <div className="toast">{msg}</div> : null;
  return { show, node };
}
