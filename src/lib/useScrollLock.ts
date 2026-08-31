import { useEffect } from "react";

/**
 * Locks document scrolling while a modal is open, and — critically —
 * always restores it.
 *
 * Uses a reference count so two overlapping overlays cannot fight: the lock
 * lifts only when the last consumer unmounts. The cleanup runs on unmount as
 * well as on `active` flipping false, so an unmounted-while-open dialog (a
 * route change mid-approval, say) can never strand the page unscrollable.
 *
 * Also compensates for scrollbar width so locking does not shift the layout.
 */
let lockCount = 0;

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const body = document.body;
    lockCount += 1;

    if (lockCount === 1) {
      const scrollbar = window.innerWidth - document.documentElement.clientWidth;
      body.dataset.scrollLocked = "true";
      if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    }

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) {
        delete body.dataset.scrollLocked;
        body.style.removeProperty("padding-right");
      }
    };
  }, [active]);
}
