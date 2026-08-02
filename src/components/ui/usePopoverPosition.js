import { useCallback, useEffect, useState } from 'react';

/**
 * Fixed-position coordinates for a popover anchored to a trigger element.
 *
 * Popovers are portalled to <body> rather than positioned inside their parent,
 * because an absolutely-positioned dropdown gets clipped by any ancestor with
 * `overflow: auto` — which includes the modal body and several scrolling
 * panels. Flips above the trigger when there isn't room below.
 */
export function usePopoverPosition(triggerRef, open, { width, estimatedHeight = 260 } = {}) {
  const [style, setStyle] = useState(null);

  const measure = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const flipUp = spaceBelow < estimatedHeight && r.top > spaceBelow;
    const w = width ?? r.width;
    const left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - w - 8));

    setStyle({
      position: 'fixed',
      left,
      width: w,
      ...(flipUp
        ? { bottom: window.innerHeight - r.top + 4, maxHeight: Math.max(140, r.top - 16) }
        : { top: r.bottom + 4, maxHeight: Math.max(140, spaceBelow - 16) }),
    });
  }, [triggerRef, open, width, estimatedHeight]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return undefined;
    measure();
    // Reposition rather than drift: any scroll in any ancestor moves the anchor.
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [open, measure]);

  return style;
}
