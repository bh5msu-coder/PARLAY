/** WhatsApp import: turns a chat export (or a pasted snippet) into candidate picks, each with its source.
 *
 *  Accepted input:
 *    - iOS exports:     [10/29/26, 7:41:02 PM] Brad Holm: Chiefs ML KC at LV -130
 *    - Android exports: 10/29/26, 7:41 PM - Brad Holm: Chiefs ML KC at LV -130
 *    - HOLM PICK blocks (the Share-to-WhatsApp format), anywhere in a message
 *    - plain pastes without timestamps: "Brad | Chiefs ML | KC at LV | -130" or "Brad: Chiefs ML KC at LV"
 *
 *  Nothing is guessed: a pick needs a known manager (exact name, nickname or alias) and a game. Lines
 *  that are not picks are skipped; lines that look like picks but cannot be read are returned as errors
 *  with their line number. Export dates are read as US month/day/year in the phone's local time.
 *
 *  This module only parses. It never saves; see lib/import/dedupe.mjs and pages/api/pick.js. */
import { blockToLeg, parseGame, parseOdds, parseType, strictWho, validatePick, numberIn, guessPlayer, guessStat } from '../ticket.mjs';
import { rawHash } from './hash.mjs';
import { teamInLabel } from './nfl-teams.mjs';

const INVISIBLE = /[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;
const IOS = /^\[(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?\]\s*(.*)$/i;
const ANDROID = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?\s+-\s+(.*)$/i;
const NOISE = /^(?:<?media omitted>?|image omitted|video omitted|sticker omitted|gif omitted|audio omitted|this message was deleted|you deleted this message|null|waiting for this message.*|.*(?:end-to-end encrypted|joined using this group's invite link|added|left|removed|changed the subject|changed this group's icon|created group).*)$/i;

function isoLocal(mo, d, y, hh, mm, ss, ap) {
  let year = Number(y); if (year < 100) year += 2000;
  let hour = Number(hh);
  if (ap) { const pm = /p/i.test(ap); if (hour === 12) hour = pm ? 12 : 0; else if (pm) hour += 12; }
  const p = (n) => String(n).padStart(2, '0');
  const month = Number(mo), day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || Number(mm) > 59) return null;
  return `${year}-${p(month)}-${p(day)}T${p(hour)}:${p(mm)}:${p(ss || 0)}`;
}

/** Split an export into messages. Continuation lines (multi-line messages) join the previous one. */
export function splitMessages(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').replace(/[\u202f\u00a0]/g, ' ').split('\n');
  const messages = [];
  const errors = [];
  let stamped = 0;
  lines.forEach((raw, i) => {
    const line = raw.replace(INVISIBLE, '');
    const m = line.match(IOS) || line.match(ANDROID);
    if (m) {
      stamped++;
      const at = isoLocal(m[1], m[2], m[3], m[4], m[5], m[6], m[7]);
      const body = m[8];
      const colon = body.match(/^([^:]{1,60}?):\s?(.*)$/);
      if (!at) { errors.push({ line: i + 1, text: line.trim(), reason: 'Unreadable timestamp' }); return; }
      if (!colon) { messages.push({ author: null, at, text: body, lineNo: i + 1, system: true }); return; }
      messages.push({ author: colon[1].trim(), at, text: colon[2], lineNo: i + 1 });
    } else if (stamped && messages.length) {
      messages[messages.length - 1].text += '\n' + line;
    } else if (line.trim()) {
      // plain paste (no export timestamps): every line stands alone
      messages.push({ author: null, at: null, text: line, lineNo: i + 1, plain: true });
    }
  });
  return { messages, errors, exportFormat: stamped > 0 };
}

const BLOCK_START = /HOLM PICK(?:\s+W(?:EEK)?\s*(\d+))?/i;
const FIELD = /^\s*(Who|Game|Type|Pick|Odds)\s*:\s*(.*)$/i;

/** Parse every HOLM PICK block in a message. */
function parseBlocks(msg) {
  const out = [];
  const lines = msg.text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const head = lines[i].match(BLOCK_START);
    if (!head) continue;
    const fields = {};
    let j = i + 1;
    // a block may also be written on one line: "HOLM PICK W8 Who: … Game: …"
    const inline = lines[i].slice(head.index + head[0].length);
    for (const part of inline.split(/(?=\b(?:Who|Game|Type|Pick|Odds)\s*:)/i)) {
      const f = part.match(FIELD); if (f) fields[f[1].toLowerCase()] = f[2].trim();
    }
    for (; j < lines.length && !BLOCK_START.test(lines[j]); j++) {
      const f = lines[j].match(FIELD);
      if (f) fields[f[1].toLowerCase()] = f[2].trim();
      else if (lines[j].trim() && Object.keys(fields).length >= 4) break;
    }
    out.push({ week: head[1] ? Number(head[1]) : null, fields, lineNo: msg.lineNo + i });
    i = j - 1;
  }
  return out;
}

function looksLikePick(text) {
  return /\b[A-Z]{2,3}\s*(?:at|@)\s*[A-Z]{2,3}\b/i.test(text) || /\b(ML|moneyline|over|under|spread|anytime|TD|[+-]\d{3,}|[+-]?\d+\.5)\b/i.test(text);
}

function legFromText(label, gameText, oddsText) {
  const game = parseGame(gameText);
  const type = parseType(label);
  return {
    type,
    label,
    game,
    team: type === 'ml' || type === 'spread' ? teamInLabel(label, game) : '',
    odds: parseOdds(oddsText),
    side: /under/i.test(label) ? 'under' : 'over',
    line: numberIn(label),
    player: type === 'player' ? guessPlayer(label) : '',
    stat: type === 'player' ? guessStat(label) : 'anyTD',
  };
}

/**
 * @param {string} text WhatsApp export or pasted text
 * @param {{roster: string[], week: number, season?: number}} opts
 * @returns {{picks: Array, errors: Array, skipped: Array, messages: number, exportFormat: boolean}}
 */
export function parseWhatsAppExport(text, opts) {
  const roster = (opts && opts.roster) || [];
  const week = Number(opts && opts.week);
  const season = Number((opts && opts.season) || 2026);
  if (typeof text !== 'string' || !text.trim()) {
    return { picks: [], errors: [{ line: 0, text: '', reason: 'Nothing to import: the paste is empty' }], skipped: [], messages: 0, exportFormat: false };
  }
  const split = splitMessages(text);
  const picks = [];
  const errors = split.errors.slice();
  const skipped = [];

  const resolve = (name, lineNo, raw) => {
    const who = strictWho(name);
    if (!who) { errors.push({ line: lineNo, text: raw, reason: `Unknown manager "${String(name).trim()}" (use a full name, nickname or alias)` }); return ''; }
    if (roster.length && !roster.includes(who)) { errors.push({ line: lineNo, text: raw, reason: `${who} is not in this week's parlay` }); return ''; }
    return who;
  };
  const accept = (who, leg, msg, lineNo, raw, blockWeek) => {
    if (blockWeek != null && week && blockWeek !== week) {
      errors.push({ line: lineNo, text: raw, reason: `This pick is marked Week ${blockWeek}; you are importing Week ${week}` });
      return;
    }
    if ((leg.type === 'ml' || leg.type === 'spread') && !leg.team) {
      errors.push({ line: lineNo, text: raw, reason: `Can't tell which team "${leg.label}" is on (name one of ${leg.game.filter(Boolean).join(' / ')})`, who, leg });
      return;
    }
    const problems = validatePick(leg, who, roster);
    if (problems.length) { errors.push({ line: lineNo, text: raw, reason: problems.join('; '), who, leg }); return; }
    const source = {
      kind: 'whatsapp',
      author: msg.author || null,
      messageAt: msg.at || null,
      lineNo,
      rawHash: rawHash([msg.author || '', msg.at || '', raw].join('|')),
    };
    picks.push({ season, week, who, leg: Object.assign({ who }, leg), source });
  };

  for (const msg of split.messages) {
    if (msg.system) continue;
    const body = msg.text.trim();
    if (!body || NOISE.test(body)) { if (body) skipped.push({ line: msg.lineNo, reason: 'Not a message' }); continue; }

    const blocks = parseBlocks(msg);
    if (blocks.length) {
      for (const b of blocks) {
        const raw = ['HOLM PICK' + (b.week ? ' W' + b.week : ''), ...Object.entries(b.fields).map(([k, v]) => `${k}: ${v}`)].join(' / ');
        const missing = ['who', 'game', 'type', 'pick'].filter((k) => !b.fields[k]);
        if (missing.length) { errors.push({ line: b.lineNo, text: raw, reason: 'HOLM PICK block is missing ' + missing.map((k) => k[0].toUpperCase() + k.slice(1)).join(', ') }); continue; }
        const who = resolve(b.fields.who, b.lineNo, raw);
        if (!who) continue;
        const game = parseGame(b.fields.game);
        if (!game[0]) { errors.push({ line: b.lineNo, text: raw, reason: `Game "${b.fields.game}" is not "AWAY at HOME" with team abbreviations` }); continue; }
        const typed = parseType(b.fields.type);
        const type = ['ml', 'spread', 'total', 'player'].includes(String(b.fields.type).toLowerCase()) ? String(b.fields.type).toLowerCase() : typed;
        const leg = blockToLeg(who, game, type, b.fields.pick, parseOdds(b.fields.odds)).leg;
        // blockToLeg takes the first capitalized word as the team ("Chiefs ML" → "ML"); use the game's teams instead
        if (type === 'ml' || type === 'spread') leg.team = teamInLabel(b.fields.pick, game);
        accept(who, leg, msg, b.lineNo, raw, b.week);
      }
      continue;
    }

    for (const [offset, rawLine] of body.split('\n').entries()) {
      const line = rawLine.trim();
      const lineNo = msg.lineNo + offset;
      if (!line) continue;
      const pipe = line.split('|').map((s) => s.trim());
      if (pipe.length >= 3) {
        const who = resolve(pipe[0].replace(/:$/, ''), lineNo, line);
        if (!who) continue;
        const leg = legFromText(pipe[1], pipe[2], pipe[3]);
        if (!leg.game[0]) { errors.push({ line: lineNo, text: line, reason: `Game "${pipe[2]}" is not "AWAY at HOME" with team abbreviations` }); continue; }
        accept(who, leg, msg, lineNo, line, null);
        continue;
      }
      let name = msg.author;
      let rest = line;
      if (msg.plain) {
        const colon = line.match(/^([^:]{2,40}):\s*(.+)$/);
        if (!colon) { skipped.push({ line: lineNo, reason: 'No "Name: pick" or pipe format' }); continue; }
        name = colon[1]; rest = colon[2];
      }
      if (!looksLikePick(rest)) { skipped.push({ line: lineNo, reason: 'Chat, not a pick' }); continue; }
      const game = parseGame(rest);
      if (!game[0]) { errors.push({ line: lineNo, text: line, reason: 'Looks like a pick but has no game ("AWAY at HOME")' }); continue; }
      const who = resolve(name, lineNo, line);
      if (!who) continue;
      const oddsText = (rest.match(/([+\-\u2212]\d{3,})/) || [])[1];
      const label = rest.replace(/\b[A-Z]{2,3}\s*(?:at|@)\s*[A-Z]{2,3}\b/i, '').replace(/[+\-\u2212]\d{3,}/, '').replace(/\s{2,}/g, ' ').trim();
      accept(who, legFromText(label, rest, oddsText ? oddsText.replace('\u2212', '-') : ''), msg, lineNo, line, null);
    }
  }
  return { picks, errors, skipped, messages: split.messages.length, exportFormat: split.exportFormat };
}
