import { useEffect, useRef } from 'react';

/**
 * Attach to a container ref to step between months on horizontal swipe.
 * - Swipe LEFT (drag finger right→left) → next month (newer in our descending list at index-1)
 * - Swipe RIGHT → previous month (older, at index+1)
 *
 * The month list is expected to be ordered newest-first with an optional 'all'
 * entry at index 0 (matching `useExpenseMonths`). We skip 'all' so swipes only
 * traverse months that actually have data.
 *
 * Bounded: stops at the oldest and newest entries — no wrap-around.
 */
const SWIPE_THRESHOLD_PX = 60;
const SWIPE_MAX_VERT_PX = 50; // if user moves vertically more than this, treat as scroll
const SWIPE_MAX_DURATION_MS = 600;

interface Month { value: string; label: string }

/**
 * Return the month values immediately older (prev) and newer (next) than
 * `currentMonth` in the same list used by `useMonthSwipe`. The `'all'`
 * sentinel is filtered out so chevrons mirror swipe behaviour.
 *
 * Months are newest-first, so `prev` lives at idx+1 and `next` at idx-1.
 * Either side returns undefined when the current month is at the boundary.
 */
export function adjacentMonths(
  months: Month[],
  currentMonth: string,
): { prev?: string; next?: string } {
  const list = months.filter(m => m.value !== 'all');
  const idx = list.findIndex(m => m.value === currentMonth);
  if (idx === -1) return {};
  return {
    prev: idx < list.length - 1 ? list[idx + 1].value : undefined,
    next: idx > 0 ? list[idx - 1].value : undefined,
  };
}

export function useMonthSwipe(
  ref: React.RefObject<HTMLElement | null>,
  months: Month[],
  currentMonth: string,
  onMonthChange: (m: string) => void,
) {
  // Always read latest props from a ref so we don't re-attach listeners on every render.
  const latest = useRef({ months, currentMonth, onMonthChange });
  latest.current = { months, currentMonth, onMonthChange };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let startX = 0;
    let startY = 0;
    let startT = 0;
    let active = false;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      active = true;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startT = Date.now();
    };

    const onEnd = (e: TouchEvent) => {
      if (!active) return;
      active = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      const dt = Date.now() - startT;
      if (dt > SWIPE_MAX_DURATION_MS) return;
      if (Math.abs(dy) > SWIPE_MAX_VERT_PX) return;
      if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;

      const { months, currentMonth, onMonthChange } = latest.current;
      // Filter out the 'all' sentinel — swipes only move through real months.
      const list = months.filter(m => m.value !== 'all');
      if (list.length < 2) return;

      // list is newest-first → index 0 is the latest month.
      const idx = list.findIndex(m => m.value === currentMonth);
      if (idx === -1) return;

      // Swipe LEFT (dx < 0) → newer month (lower index). Bounded at 0.
      // Swipe RIGHT (dx > 0) → older month (higher index). Bounded at length-1.
      const nextIdx = dx < 0 ? idx - 1 : idx + 1;
      if (nextIdx < 0 || nextIdx >= list.length) return;
      onMonthChange(list[nextIdx].value);
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchend', onEnd);
    };
  }, [ref]);
}
