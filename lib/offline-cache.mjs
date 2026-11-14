/** Last weeks and picks saved on this phone, so a later load with no network can still show them.
 *  The storage object is passed in (localStorage in the browser, a fake in tests). Nothing here
 *  touches the network or the database. */

export const OFFLINE_KEY = 'hp_offline_v1';

export function browserStorage() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch (e) {
    return null;
  }
}

export function readSnapshot(storage) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(OFFLINE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || !Array.isArray(data.weeks)) return null;
    return { weeks: data.weeks, picks: data.picks && typeof data.picks === 'object' ? data.picks : {}, at: data.at || null };
  } catch (e) {
    return null;
  }
}

/** Merge a new piece into the saved snapshot. `weeks` replaces the week list; `picks` merges by week. */
export function writeSnapshot(storage, patch) {
  if (!storage || !patch) return null;
  const prev = readSnapshot(storage) || { weeks: [], picks: {}, at: null };
  const next = {
    weeks: Array.isArray(patch.weeks) ? patch.weeks : prev.weeks,
    picks: Object.assign({}, prev.picks, patch.picks || {}),
    at: Date.now(),
  };
  try {
    storage.setItem(OFFLINE_KEY, JSON.stringify(next));
  } catch (e) { /* private mode or a full disk: the page still works online */ }
  return next;
}
