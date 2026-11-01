'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { apiGet } from '@/lib/api-client';
import { Spinner } from './ui';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let alive = true;
    apiGet('/api/auth/me')
      .then(() => alive && setOk(true))
      .catch(() => {
        if (!alive) return;
        // preserve the full path + query (e.g. /admin/claim?screen=…) so a QR
        // scan still works when the manager isn't logged in yet
        const next =
          typeof window !== 'undefined' ? window.location.pathname + window.location.search : pathname;
        router.replace(`/admin/login?next=${encodeURIComponent(next)}`);
      });
    return () => {
      alive = false;
    };
  }, [pathname, router]);

  if (!ok) return <Spinner />;
  return <>{children}</>;
}
