'use client';
import Link from 'next/link';
import { useLeague, useReady } from './LeagueProvider';
import { Page } from './Topbar';
import { ident } from '../lib/ident.mjs';
import { ThemeButtons } from './ThemeControl';
import { InstallCard } from './InstallPrompt';
import PushOptIn from './PushOptIn';

const LINKS = [
  { href: '/league', title: 'League', note: 'Champions, managers, rivalries' },
  { href: '/chat', title: 'Chat', note: 'Smack and the weekly tape' },
  { href: '/bets', title: 'Money', note: 'Stakes, payouts, the history tape' },
  { href: '/pick', title: 'Full pick form', note: 'Type a leg by hand' },
  { href: '/commissioner', title: 'Commissioner', note: 'Weeks, slips, nicknames' },
];

/** Profile, appearance, install, alerts, and the pages that used to be their own tabs. */
export default function MoreView() {
  const store = useLeague();
  const ready = useReady();
  const you = ready ? (store.state.config.you || '') : '';
  const chat = ready ? store.state.config.chat : '';
  return (
    <Page title="More" sub="You, alerts, and the rest of the league" early>
      <section className="card">
        <div className="card__head"><h2>Who’s using this phone</h2></div>
        <div className="card__body">
          <div className="field">
            <label htmlFor="more-who">Your name</label>
            <select id="more-who" value={you} onChange={(e) => store.setYou(e.target.value)}>
              <option value="">Select yourself</option>
              {ident.people.map((p) => <option key={p.id} value={p.name}>{p.nick || p.name}</option>)}
            </select>
          </div>
          <p className="muted">Saved on this phone only. It highlights your leg and your row.</p>
        </div>
      </section>

      <section className="card">
        <div className="card__head"><h2>Appearance</h2><span className="sub">System follows the phone</span></div>
        <div className="card__body"><ThemeButtons /></div>
      </section>

      <InstallCard />
      <PushOptIn who={you} />

      <nav className="hub" aria-label="Rest of the league">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href}><span>{l.title}</span><span>{l.note}</span></Link>
        ))}
        {chat ? <a href={chat} target="_blank" rel="noopener"><span>WhatsApp</span><span>The group chat</span></a> : null}
      </nav>
    </Page>
  );
}
