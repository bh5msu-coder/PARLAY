/** Draws the week's ticket as a PNG in the browser (canvas), in the site's link-preview colors.
 *  legs: [{ who, label, odds, tone: 'win'|'loss'|'live'|'push'|'pending' }]. Returns a Blob. */
const C = { ground: '#070d14', card: '#0f1720', line: '#1e2a36', ink: '#e8edf2', muted: '#909aa6', gold: '#c9a24a', win: '#34d8b0', loss: '#e5484d', live: '#c9a24a', pending: '#6ea8ff', push: '#909aa6' };
const W = 1080;
const ROW = 92;

function fit(ctx, text, max) {
  let t = String(text || '');
  if (ctx.measureText(t).width <= max) return t;
  while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
}

export async function ticketImage({ title, eyebrow, status, statusTone, legs, footer }) {
  const list = legs || [];
  const H = 300 + list.length * ROW + 120;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  try { await document.fonts.ready; } catch (e) { /* ignore */ }
  const face = getComputedStyle(document.body).getPropertyValue('--font-display').trim() || 'system-ui, sans-serif';
  const sans = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillStyle = C.ground; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.muted; ctx.font = `600 26px ${sans}`; ctx.fillText(String(eyebrow || 'OUR HOLM LEAGUE').toUpperCase(), 64, 82);
  ctx.fillStyle = C.ink; ctx.font = `700 76px ${face}`; ctx.fillText(fit(ctx, title, W - 128), 64, 164);
  if (status) { ctx.fillStyle = C[statusTone] || C.pending; ctx.font = `700 40px ${face}`; ctx.fillText(status, 64, 218); }
  ctx.fillStyle = C.gold; ctx.fillRect(64, 244, W - 128, 4);
  list.forEach((l, i) => {
    const y = 270 + i * ROW;
    ctx.fillStyle = i % 2 ? C.ground : C.card; ctx.fillRect(48, y, W - 96, ROW - 8);
    ctx.fillStyle = C[l.tone] || C.pending;
    ctx.beginPath(); ctx.arc(86, y + (ROW - 8) / 2, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.ink; ctx.font = `700 30px ${sans}`; ctx.fillText(fit(ctx, l.who, 300), 116, y + 54);
    ctx.font = `500 29px ${sans}`; ctx.fillText(fit(ctx, l.label, 470), 432, y + 54);
    if (l.odds !== '' && l.odds != null) {
      const o = Number(l.odds); const s = Number.isFinite(o) ? (o > 0 ? '+' + o : String(o)) : String(l.odds);
      ctx.fillStyle = C.muted; ctx.font = `600 30px ${sans}`; const w = ctx.measureText(s).width; ctx.fillText(s, W - 72 - w, y + 54);
    }
  });
  ctx.fillStyle = C.muted; ctx.font = `500 26px ${sans}`; ctx.fillText(fit(ctx, footer || 'holm-parlay.vercel.app', W - 128), 64, H - 56);
  return await new Promise((ok) => cv.toBlob(ok, 'image/png'));
}

/** Share the PNG through the phone's share sheet (WhatsApp shows up there); download it otherwise. */
export async function shareTicketImage(opts, filename) {
  const blob = await ticketImage(opts);
  const file = new File([blob], filename || 'holm-ticket.png', { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: opts.title });
    return 'shared';
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'downloaded';
}
