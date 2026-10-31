/** Canvas drawing for the Season Elo chart and the shareable league tape image (browser only).
 *  Extracted from the legacy app.js (behavior unchanged). */
import { atYear, seasonRows } from './ident.mjs';
import { toast } from './clients.mjs';

export function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
export function wrapText(ctx, text, maxW) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (cur && ctx.measureText(t).width > maxW) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}
export function tapeLineChart(ctx, o) {
  const { x, y, w, h, title, yLabel, years, series, yMin, yMax, invert, ticks, fmt, labelPoints, col, fonts } = o;
  const L = 64, R = 16, T = 40, B = 40;
  const px = x + L, py = y + T, pw = w - L - R, ph = h - T - B;
  const hasVal = (v) => v != null && v === v;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = col.ink; ctx.font = '600 20px ' + fonts.display;
  ctx.fillText(title, x, y + 20);
  ctx.save();
  ctx.translate(x + 14, py + ph / 2); ctx.rotate(-Math.PI / 2);
  ctx.font = '600 11px ' + fonts.sans; ctx.fillStyle = col.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(yLabel.toUpperCase(), 0, 0);
  ctx.restore();
  const span = (yMax - yMin) || 1;
  const yPos = (v) => invert ? py + ((v - yMin) / span) * ph : py + ph - ((v - yMin) / span) * ph;
  const xPos = (i) => years.length === 1 ? px + pw / 2 : px + (i / (years.length - 1)) * pw;
  ctx.font = '500 12px ' + fonts.mono; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const t of ticks) {
    const yy = yPos(t);
    ctx.strokeStyle = col.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px, yy); ctx.lineTo(px + pw, yy); ctx.stroke();
    ctx.fillStyle = col.muted; ctx.fillText(fmt(t), px - 10, yy);
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = col.muted; ctx.font = '500 12px ' + fonts.mono;
  years.forEach((yr, i) => ctx.fillText(String(yr), xPos(i), py + ph + 10));
  series.forEach((s, si) => {
    let lastI = -1;
    for (let i = s.data.length - 1; i >= 0; i--) { if (hasVal(s.data[i])) { lastI = i; break; } }
    ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    let drawing = false;
    s.data.forEach((v, i) => {
      if (!hasVal(v)) { drawing = false; return; }
      const X = xPos(i), Y = yPos(v);
      if (!drawing) { ctx.moveTo(X, Y); drawing = true; } else ctx.lineTo(X, Y);
    });
    ctx.stroke();
    s.data.forEach((v, i) => {
      if (!hasVal(v)) return;
      const X = xPos(i), Y = yPos(v);
      const champ = !!(s.champ && s.champ[i]);
      const r = s.dot != null ? s.dot : (champ ? 7 : 4.5);
      ctx.fillStyle = champ ? col.gold : s.color;
      ctx.beginPath(); ctx.arc(X, Y, r, 0, Math.PI * 2); ctx.fill();
      if (champ) { ctx.strokeStyle = col.bg; ctx.lineWidth = 2; ctx.stroke(); }
      const mode = s.labelPoints != null ? s.labelPoints : labelPoints;
      const showLabel = mode === 'all' || (mode === 'last' && i === lastI);
      if (showLabel) {
        ctx.font = '500 11px ' + fonts.mono; ctx.fillStyle = s.color; ctx.textAlign = 'center';
        let above = si === 0;
        if (above && Y - 22 < py - 4) above = false;
        if (!above && Y + 22 > py + ph + 4) above = true;
        ctx.textBaseline = above ? 'bottom' : 'top';
        ctx.fillText(fmt(v), X, above ? Y - 10 : Y + 10);
      }
    });
  });
  if (o.legend === false) return;
  let lx = x + w - R;
  ctx.font = '600 13px ' + fonts.sans; ctx.textBaseline = 'middle';
  for (let i = series.length - 1; i >= 0; i--) {
    const s = series[i];
    ctx.textAlign = 'right'; ctx.fillStyle = col.ink; ctx.fillText(s.name, lx, y + 14);
    lx -= ctx.measureText(s.name).width + 8;
    ctx.fillStyle = s.color; ctx.fillRect(lx - 14, y + 9, 14, 10);
    lx -= 26;
  }
}
export function tapeCanvas(a, b, rec, target) {
  const same = rec.same;
  const years = same ? seasonRows(a).map((s) => s.season) : rec.years.slice();
  const c = target || document.createElement('canvas');
  const W = 1200, pad = 48, scale = 2;
  const fonts = { display: cssVar('--font-display', 'sans-serif'), sans: cssVar('--font-sans', 'sans-serif'), mono: cssVar('--font-mono', 'monospace') };
  const col = {
    bg: cssVar('--surface-100', '#131a22'), line: cssVar('--line', '#263241'), ink: cssVar('--ink', '#e8edf2'), muted: cssVar('--ink-muted', '#8b99a8'),
    a: cssVar('--brand', '#4d8bff'), b: cssVar('--loss', '#ff8a4c'), gold: cssVar('--pending', '#f5c542'),
  };
  const ctx = c.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = '600 24px ' + fonts.sans;
  const recLines = wrapText(ctx, rec.line, W - pad * 2);
  ctx.font = '400 15px ' + fonts.sans;
  const statLines = wrapText(ctx, rec.stat, W - pad * 2);
  const hasChart = years.length > 0;
  const chart1H = 320, chart2H = 280, gap = 28;
  const headerH = 32 + 56 + recLines.length * 32 + 8 + statLines.length * 22 + 20;
  const H = pad + headerH + (hasChart ? chart1H + gap + chart2H : 48) + 64;
  c.width = W * scale; c.height = H * scale;
  c.style.aspectRatio = W + ' / ' + H;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = col.bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = col.a; ctx.fillRect(0, 0, W, 6);
  let y = pad;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = col.muted; ctx.font = '600 13px ' + fonts.sans;
  ctx.fillText('HOLM LEAGUE TAPE · 2010–2025 · FINAL PLACE AND POINTS FOR', pad, y + 13); y += 32;
  ctx.fillStyle = col.ink; ctx.font = '700 44px ' + fonts.display;
  ctx.fillText((same ? a.nick : a.nick + ' vs ' + b.nick).toUpperCase(), pad, y + 40); y += 56;
  ctx.font = '600 24px ' + fonts.sans;
  for (const l of recLines) { ctx.fillText(l, pad, y + 24); y += 32; }
  y += 8;
  ctx.fillStyle = col.muted; ctx.font = '400 15px ' + fonts.sans;
  for (const l of statLines) { ctx.fillText(l, pad, y + 15); y += 22; }
  y += 20;
  if (hasChart) {
    const rankSeries = [{ name: a.nick, color: col.a, data: years.map((yr) => atYear(a, yr).rank), champ: years.map((yr) => atYear(a, yr).champion) }];
    const pfSeries = [{ name: a.nick, color: col.a, data: years.map((yr) => atYear(a, yr).pf), champ: years.map((yr) => atYear(a, yr).champion) }];
    if (!same) {
      rankSeries.push({ name: b.nick, color: col.b, data: years.map((yr) => atYear(b, yr).rank), champ: years.map((yr) => atYear(b, yr).champion) });
      pfSeries.push({ name: b.nick, color: col.b, data: years.map((yr) => atYear(b, yr).pf), champ: years.map((yr) => atYear(b, yr).champion) });
    }
    tapeLineChart(ctx, {
      x: pad, y, w: W - pad * 2, h: chart1H,
      title: same ? 'Final place by year' : 'Final place by year, shared seasons',
      yLabel: 'Final place (1 = champion)', years, series: rankSeries,
      yMin: 1, yMax: 12, invert: true, ticks: [1, 3, 6, 9, 12], fmt: (v) => String(v), labelPoints: 'all', col, fonts,
    });
    y += chart1H + gap;
    const all = pfSeries.flatMap((s) => s.data);
    const lo = Math.floor((Math.min(...all) - 60) / 100) * 100;
    const hi = Math.ceil((Math.max(...all) + 60) / 100) * 100;
    const step = (hi - lo) / 4;
    tapeLineChart(ctx, {
      x: pad, y, w: W - pad * 2, h: chart2H,
      title: 'Season points for',
      yLabel: 'Points for', years, series: pfSeries,
      yMin: lo, yMax: hi, invert: false, ticks: [0, 1, 2, 3, 4].map((k) => lo + k * step),
      fmt: (v) => Math.round(v).toLocaleString('en-US'), labelPoints: 'last', col, fonts,
    });
    y += chart2H;
  } else {
    ctx.fillStyle = col.muted; ctx.font = '400 16px ' + fonts.sans;
    ctx.fillText('No season on file to chart.', pad, y + 20); y += 48;
  }
  ctx.strokeStyle = col.line; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad, y + 16); ctx.lineTo(W - pad, y + 16); ctx.stroke();
  ctx.fillStyle = col.muted; ctx.font = '400 12px ' + fonts.sans; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('Source: ESPN league 182263 via league-lore.json. Final place is season standings, not weekly head-to-head. Gold dot = champion.', pad, y + 40);
  ctx.textAlign = 'right'; ctx.fillText(/localhost|127\.0\.0\.1/.test(location.hostname) ? 'holm-parlay.vercel.app' : location.host, W - pad, y + 40);
  return c;
}
export function canvasBlob(c, type, quality) {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not render image'))), type, quality));
}
export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
export function jpegPdf(jpegBytes, wPx, hPx, wPt, hPt) {
  const enc = new TextEncoder();
  const parts = [];
  const offsets = [];
  let len = 0;
  const push = (x) => { const u = typeof x === 'string' ? enc.encode(x) : x; parts.push(u); len += u.length; };
  const obj = (n, body) => {
    offsets[n] = len;
    push(n + ' 0 obj\n');
    if (typeof body === 'string') push(body);
    else { push(body.head); push(body.bytes); push('\nendstream'); }
    push('\nendobj\n');
  };
  push('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + wPt + ' ' + hPt + '] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
  obj(4, { head: '<< /Type /XObject /Subtype /Image /Width ' + wPx + ' /Height ' + hPx + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpegBytes.length + ' >>\nstream\n', bytes: jpegBytes });
  const content = 'q ' + wPt + ' 0 0 ' + hPt + ' 0 0 cm /Im0 Do Q';
  obj(5, { head: '<< /Length ' + content.length + ' >>\nstream\n', bytes: enc.encode(content) });
  const xref = len;
  let tail = 'xref\n0 6\n0000000000 65535 f \n';
  for (let i = 1; i <= 5; i++) tail += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  tail += 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  push(tail);
  return new Blob(parts, { type: 'application/pdf' });
}
export function tapeFileBase(a, b) {
  const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return 'holm-tape-' + (a.id === b.id ? slug(a.nick) : slug(a.nick) + '-vs-' + slug(b.nick)) + '-2010-2025';
}
export async function saveTape(c, a, b, kind) {
  const base = tapeFileBase(a, b);
  try {
    if (kind === 'png') { downloadBlob(await canvasBlob(c, 'image/png'), base + '.png'); toast('PNG saved'); return; }
    if (kind === 'jpeg') { downloadBlob(await canvasBlob(c, 'image/jpeg', 0.92), base + '.jpg'); toast('JPEG saved'); return; }
    const jpeg = await canvasBlob(c, 'image/jpeg', 0.92);
    const bytes = new Uint8Array(await jpeg.arrayBuffer());
    downloadBlob(jpegPdf(bytes, c.width, c.height, Math.round(c.width / 2), Math.round(c.height / 2)), base + '.pdf');
    toast('PDF saved');
  } catch (e) { toast('Could not save: ' + e.message); }
}
export async function shareTape(c, a, b, text) {
  const base = tapeFileBase(a, b);
  let blob;
  try { blob = await canvasBlob(c, 'image/png'); } catch (e) { toast('Could not render image'); return; }
  const file = new File([blob], base + '.png', { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], text }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  downloadBlob(blob, base + '.png');
  toast('Image saved to this device. Attach it in WhatsApp — the text is opening now.');
  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
}
export function drawSeasonElo(c, elo, selectedName) {
  const W = 1000, H = 380, pad = 8, scale = 2;
  const fonts = { display: cssVar('--font-display', 'sans-serif'), sans: cssVar('--font-sans', 'sans-serif'), mono: cssVar('--font-mono', 'monospace') };
  const col = {
    bg: cssVar('--surface-0', '#0b0f14'), line: cssVar('--line', '#263241'), ink: cssVar('--ink', '#e8edf2'), muted: cssVar('--ink-muted', '#8b99a8'),
    a: cssVar('--brand', '#4d8bff'), b: cssVar('--loss', '#ff8a4c'), gold: cssVar('--pending', '#f5c542'),
  };
  const vals = elo.now.flatMap((r) => elo.series[r.id].filter((v) => v != null));
  if (!vals.length) return;
  const lo = Math.floor((Math.min.apply(null, vals) - 20) / 50) * 50;
  const hi = Math.ceil((Math.max.apply(null, vals) + 20) / 50) * 50;
  const ticks = [];
  for (let t = lo; t <= hi; t += 50) ticks.push(t);
  const focusId = (elo.now.find((r) => r.name === selectedName) || {}).id;
  const series = elo.now.map((r) => {
    const on = r.id === focusId;
    return {
      name: r.nick,
      color: on ? col.a : col.muted,
      data: elo.series[r.id],
      width: on ? 3.5 : 1.5,
      dot: on ? 5 : 2.5,
      labelPoints: on ? 'last' : 'none',
    };
  }).sort((a, b) => a.width - b.width);
  c.width = W * scale; c.height = H * scale;
  c.style.aspectRatio = W + ' / ' + H;
  const ctx = c.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = col.bg; ctx.fillRect(0, 0, W, H);
  tapeLineChart(ctx, {
    x: pad, y: 4, w: W - pad * 2, h: H - 8,
    title: 'Season Elo by year',
    yLabel: 'Elo rating',
    years: elo.years, series,
    yMin: lo, yMax: hi, invert: false, ticks,
    fmt: (v) => String(Math.round(v)),
    labelPoints: 'none', legend: false, col, fonts,
  });
}
