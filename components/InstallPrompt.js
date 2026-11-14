'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

const HIDE = 'hp_a2hs_hide';

function isIos() {
  const ua = navigator.userAgent || '';
  return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalone() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  } catch (e) { return false; }
}

/** How to put the app on the home screen. Stays on the More page. */
export function InstallCard() {
  const [prompt, setPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  useEffect(() => {
    setInstalled(isStandalone());
    setIos(isIos());
    const on = (e) => { e.preventDefault(); setPrompt(e); };
    window.addEventListener('beforeinstallprompt', on);
    return () => window.removeEventListener('beforeinstallprompt', on);
  }, []);
  const install = async () => {
    if (!prompt) return;
    prompt.prompt();
    try { await prompt.userChoice; } catch (e) { /* the browser closed it */ }
    setPrompt(null);
  };
  return (
    <section className="card" id="install">
      <div className="card__head"><h2>Add to Home Screen</h2><span className="sub">Opens like an app. Alerts need this on iPhone.</span></div>
      <div className="card__body">
        {installed ? <p>This phone is already opening Holm Parlay from the home screen.</p> : null}
        {!installed && prompt ? <button type="button" className="btn btn--cta" onClick={install}>Install app</button> : null}
        {!installed && ios ? (
          <ol className="steps">
            <li>Tap the Share button in Safari (the square with the arrow).</li>
            <li>Tap <strong>Add to Home Screen</strong>, then Add.</li>
            <li>Open Holm Parlay from the new icon. Push alerts work from that icon on iOS 16.4 and newer.</li>
          </ol>
        ) : null}
        {!installed && !ios && !prompt ? <p>In Chrome or Edge, open the browser menu and choose <strong>Install app</strong> or <strong>Add to Home Screen</strong>.</p> : null}
      </div>
    </section>
  );
}

/** A one-time banner on a phone that has not installed the app. */
export function InstallBanner() {
  const [show, setShow] = useState(false);
  const [prompt, setPrompt] = useState(null);
  useEffect(() => {
    if (isStandalone()) return undefined;
    try { if (localStorage.getItem(HIDE) === '1') return undefined; } catch (e) { /* show it */ }
    setShow(true);
    const on = (e) => { e.preventDefault(); setPrompt(e); };
    window.addEventListener('beforeinstallprompt', on);
    return () => window.removeEventListener('beforeinstallprompt', on);
  }, []);
  if (!show) return null;
  const dismiss = () => {
    try { localStorage.setItem(HIDE, '1'); } catch (e) { /* ignore */ }
    setShow(false);
  };
  const install = async () => {
    if (!prompt) return;
    prompt.prompt();
    try { await prompt.userChoice; } catch (e) { /* closed */ }
    dismiss();
  };
  return (
    <aside className="a2hs" role="region" aria-label="Install the app">
      <p>Add Holm Parlay to your home screen to open it like an app and get alerts.</p>
      <div className="inline">
        {prompt ? <button type="button" className="btn btn--cta btn--sm" onClick={install}>Install</button> : <Link className="btn btn--cta btn--sm" href="/more#install">How to add it</Link>}
        <button type="button" className="btn btn--ghost btn--sm" onClick={dismiss}>Not now</button>
      </div>
    </aside>
  );
}
