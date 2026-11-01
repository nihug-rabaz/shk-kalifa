'use client';
import { useEffect } from 'react';

// Runs on every page. The offline app-shell service worker is currently
// disabled (it caused stale content). This ensures any previously-registered
// service worker + its caches are removed on every device.
export function ServiceWorkerManager() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => regs.forEach((r) => r.unregister()))
      .catch(() => {});
    if (typeof caches !== 'undefined') {
      caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
    }
  }, []);

  return null;
}
