'use client';
import { useEffect } from 'react';

/** Registers the service worker that caches the last data and receives push alerts. */
export default function PwaClient() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    const register = () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
    return undefined;
  }, []);
  return null;
}
