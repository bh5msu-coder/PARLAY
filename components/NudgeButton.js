'use client';
import { ident } from '../lib/ident.mjs';
import { nudgeHref, nudgeText } from '../lib/nudge.mjs';
import { toast } from '../lib/clients.mjs';

/** Opens WhatsApp with a ready message naming who still owes a pick. Copies it too, for desktop. */
export default function NudgeButton({ week, missing, kick, className }) {
  if (!missing || !missing.length) return null;
  const text = nudgeText(week, missing, (n) => ident.nick(n), { kick });
  return (
    <a className={'btn btn--secondary ' + (className || '')} href={nudgeHref(text)} target="_blank" rel="noopener"
      onClick={() => { try { navigator.clipboard.writeText(text); toast('Nudge copied — paste it in the Holm chat'); } catch (e) { /* ignore */ } }}>
      {missing.length === 1 ? `Nudge ${ident.nick(missing[0])}` : `Nudge the ${missing.length} missing`}
    </a>
  );
}
