/** Display formatters shared by every page. Extracted from the legacy app.js (behavior unchanged). */

export const MINUS = '−';

export const fmtOdds = (o) => {
  if (o == null || o === '' || isNaN(o)) return '–';
  const n = Number(o);
  if (n === 100) return 'EVEN';
  return (n > 0 ? '+' : MINUS) + Math.abs(n).toLocaleString('en-US');
};

export const fmtMoney = (n, signed) => {
  if (n == null || isNaN(n)) return '–';
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (!signed) return '$' + abs;
  return (n < 0 ? MINUS : n > 0 ? '+' : '') + '$' + abs;
};

export const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '–');
export const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export const fmtKick = (iso) => {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET';
};

export function weekdayET(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'America/New_York' }).format(new Date(iso));
}

export function formatKickET(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
  }).format(new Date(iso)) + ' ET';
}

export function fmtFinish(n) { return n == null ? '–' : (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, ''); }
export function fmtElo(n) { return String(Math.round(n)); }

export function uniq(arr) {
  const out = [];
  const seen = new Set();
  for (const x of arr) {
    if (!x || seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}

export const STATUS_LABEL = { won: 'Won', lost: 'Lost', push: 'Push', void: 'Void', live: 'Live', pending: 'Pending', unknown: 'Unknown' };
