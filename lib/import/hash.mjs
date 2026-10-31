/** Small deterministic hash (two FNV-1a 32-bit passes → 16 hex chars). Same output in Node and the
 *  browser, so an imported message gets the same rawHash wherever it is parsed. Not for security. */
export function rawHash(text) {
  const s = String(text == null ? '' : text);
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x01000193 ^ 0x2f) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}
