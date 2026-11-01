import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Link preview art in the site's colors: navy ground, gold rule, teal brand. Built at deploy time. */
export const OG_SIZE = { width: 1200, height: 630 };
const C = { ground: '#070d14', card: '#0f1720', ink: '#e8edf2', muted: '#909aa6', gold: '#c9a24a', win: '#34d8b0', loss: '#e5484d', pending: '#6ea8ff' };

/** Barlow Condensed (the site's title face) from Google Fonts at build time; the default face if it cannot load. */
export async function ogFonts() {
  try {
    const css = await (await fetch('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700')).text();
    const urls = [...css.matchAll(/font-weight:\s*(\d+);[^}]*?src:\s*url\(([^)]+)\)/g)];
    const fonts = [];
    for (const [, weight, url] of urls) fonts.push({ name: 'Barlow Condensed', data: await (await fetch(url)).arrayBuffer(), weight: Number(weight), style: 'normal' });
    return fonts;
  } catch (e) {
    return [];
  }
}

async function emblem() {
  const buf = await readFile(join(process.cwd(), 'public', 'emblem-256.png'));
  return 'data:image/png;base64,' + buf.toString('base64');
}

export async function cardElement({ eyebrow, title, status, line, stats }) {
  const tone = status === 'BUSTED' ? C.loss : status === 'CASHED' ? C.win : C.pending;
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: C.ground, color: C.ink, padding: '56px 64px', fontFamily: '"Barlow Condensed", sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <img src={await emblem()} width={96} height={96} alt="" />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 24, color: C.muted, letterSpacing: 3 }}>{eyebrow}</span>
          <span style={{ fontSize: 52, fontWeight: 700, letterSpacing: 1 }}>OUR HOLM LEAGUE</span>
        </div>
      </div>
      <div style={{ height: 4, background: C.gold, margin: '24px 0 22px', width: '100%' }} />
      <span style={{ fontSize: 96, fontWeight: 700, lineHeight: 1 }}>{title}</span>
      {status ? <span style={{ fontSize: 72, fontWeight: 700, color: tone, marginTop: 6 }}>{status}</span> : null}
      {line ? <span style={{ fontSize: 34, color: C.muted, marginTop: 4 }}>{line}</span> : null}
      <div style={{ display: 'flex', gap: 48, marginTop: 'auto' }}>
        {(stats || []).filter((s) => s.value).map((s) => (
          <div key={s.label} style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 22, color: C.muted, letterSpacing: 2 }}>{s.label}</span>
            <span style={{ fontSize: 56, fontWeight: 700 }}>{s.value}</span>
          </div>))}
      </div>
    </div>
  );
}
