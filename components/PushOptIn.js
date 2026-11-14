'use client';
import { useEffect, useState } from 'react';
import { isStandalone } from './InstallPrompt';

function isIos() {
  const ua = navigator.userAgent || '';
  return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Opt in to leg, bust, cash, and missing-pick alerts. The subscription is stored by /api/push. */
export default function PushOptIn({ who }) {
  const [status, setStatus] = useState('checking');
  const [note, setNote] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        if (live) setStatus('unsupported');
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (live) setStatus(sub ? 'on' : 'off');
      } catch (e) {
        if (live) setStatus('off');
      }
    })();
    return () => { live = false; };
  }, []);

  const turnOn = async () => {
    setNote('');
    if (isIos() && !isStandalone()) {
      setStatus('needs-install');
      setNote('On iPhone, add the app to the home screen first, then open it from the icon and turn alerts on there.');
      return;
    }
    setStatus('busy');
    try {
      const info = await fetch('/api/push').then((r) => r.json());
      if (!info.publicKey || !info.ready) {
        setStatus('unconfigured');
        setNote('Alerts are not switched on for this deploy yet. Brad still needs the VAPID keys, the service role key, and the push migration.');
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setStatus('off');
        setNote(perm === 'denied' ? 'Notifications are blocked for this app in the phone settings.' : 'Permission was not granted.');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(info.publicKey) });
      const r = await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'subscribe', who: who || '', subscription: sub.toJSON() }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setStatus('off');
        setNote(data.hint || data.error || 'Could not save this phone.');
        return;
      }
      setStatus('on');
      setNote('This phone will hear when a leg hits, the ticket busts or cashes, and when picks are still out.');
    } catch (e) {
      setStatus('off');
      setNote('Could not turn alerts on from this browser.');
    }
  };

  const turnOff = async () => {
    setStatus('busy');
    setNote('');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      const endpoint = sub && sub.endpoint;
      if (sub) await sub.unsubscribe();
      if (endpoint) {
        await fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'unsubscribe', endpoint }) });
      }
      setStatus('off');
      setNote('Alerts are off on this phone.');
    } catch (e) {
      setStatus('on');
      setNote('Could not turn alerts off.');
    }
  };

  return (
    <section className="card" id="alerts">
      <div className="card__head"><h2>Alerts</h2><span className="sub">Leg hits, a bust, a cash, picks still out</span></div>
      <div className="card__body">
        {status === 'checking' || status === 'busy' ? <p className="muted">Checking this phone…</p> : null}
        {status === 'unsupported' ? <p>This browser cannot receive Web Push alerts.</p> : null}
        {status === 'unconfigured' ? <p>{note}</p> : null}
        {status === 'needs-install' ? <p>{note}</p> : null}
        {status === 'on' ? (
          <>
            <p>{note || 'Alerts are on for this phone.'}</p>
            <button type="button" className="btn btn--secondary" onClick={turnOff}>Turn alerts off</button>
          </>
        ) : null}
        {status === 'off' ? (
          <>
            {note ? <p>{note}</p> : <p>Get a ping when the ticket moves, and a reminder if picks are still out after Thursday afternoon.</p>}
            <button type="button" className="btn btn--cta" onClick={turnOn}>Turn alerts on</button>
          </>
        ) : null}
      </div>
    </section>
  );
}
