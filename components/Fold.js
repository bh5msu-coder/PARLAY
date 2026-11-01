'use client';
import { useEffect, useRef, useState } from 'react';

/** A card body that is cut short on phones (globals.css .fold) with a Show all button.
 *  The button shows only when the body is actually taller than the cut. Desktop never folds. */
export default function Fold({ className = '', children }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [cut, setCut] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const check = () => setCut(el.scrollHeight > el.clientHeight + 8);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <>
      <div ref={ref} className={`${className} fold${open ? ' fold--open' : ''}${cut && !open ? ' fold--cut' : ''}`}>{children}</div>
      {cut || open ? (
        <button type="button" className="btn btn--ghost btn--sm fold__btn" onClick={() => setOpen(!open)}>{open ? 'Show less' : 'Show all'}</button>
      ) : null}
    </>
  );
}
