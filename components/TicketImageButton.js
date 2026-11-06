'use client';
import { useState } from 'react';
import { shareTicketImage } from '../lib/ticket-image.js';
import { toast } from '../lib/clients.mjs';

/** One tap: the whole ticket as an image card for WhatsApp. Nothing is sent until the user picks a chat. */
export default function TicketImageButton({ opts, filename, label = 'Share ticket image' }) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const how = await shareTicketImage(opts, filename);
      if (how === 'downloaded') toast('Image saved — attach it in WhatsApp');
    } catch (e) {
      if (!e || e.name !== 'AbortError') toast('Could not make the image');
    } finally { setBusy(false); }
  };
  return <button className="btn btn--secondary btn--sm" type="button" onClick={go} disabled={busy || !(opts.legs || []).length}>{busy ? 'Making image…' : label}</button>;
}
