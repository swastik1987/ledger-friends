import { useEffect, useRef } from 'react';

/**
 * Make the device back gesture / browser back button close an open overlay
 * (bottom sheet, dialog, popover) instead of navigating the underlying page.
 *
 * The hook is invoked by each Radix Root wrapper in `src/components/ui/`
 * (Sheet, AlertDialog, Dialog, Popover) — controlled overlays automatically
 * pick this up; consumers do nothing.
 *
 * Mechanics:
 *   1. When `open` transitions to true, push a sentinel history entry
 *      (`{ __overlay: <id> }`) and register a close handler on a
 *      module-level stack.
 *   2. On `popstate`, pop the top handler and invoke it (closes the
 *      topmost overlay; matches Android one-layer-at-a-time semantics).
 *   3. On programmatic close (user clicks X, ESC, outside-click), the
 *      effect cleanup splices our entry out of the stack and pops our
 *      sentinel from history with `suppressPop=true` so we don't
 *      re-close ourselves.
 *
 * URL is preserved across the round-trip because pushState is called
 * without a URL argument, so React Router never sees a navigation.
 *
 * Limitations:
 *   - Uncontrolled overlays (no `open` prop) are skipped — we have
 *     nothing to set false from outside.
 *   - If an overlay is force-unmounted by route navigation while open,
 *     its sentinel may stay in history. Worst case: one wasted back
 *     press later. Rare and harmless.
 */

interface StackEntry {
  id: number;
  close: () => void;
}

const stack: StackEntry[] = [];
let nextId = 1;
let suppressPop = false;
let listenerBound = false;

function onPopState() {
  if (suppressPop) { suppressPop = false; return; }
  const top = stack.pop();
  if (top) top.close();
  if (stack.length === 0) detachListener();
}

function attachListener() {
  if (listenerBound || typeof window === 'undefined') return;
  window.addEventListener('popstate', onPopState);
  listenerBound = true;
}

function detachListener() {
  if (!listenerBound || typeof window === 'undefined') return;
  window.removeEventListener('popstate', onPopState);
  listenerBound = false;
}

export function useOverlayBack(
  open: boolean | undefined,
  setOpen: ((open: boolean) => void) | undefined,
) {
  // Keep latest setter in a ref so the close handler captured in the stack
  // doesn't go stale if the parent re-renders with a fresh closure.
  const setOpenRef = useRef(setOpen);
  setOpenRef.current = setOpen;

  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    // Uncontrolled overlay → nothing to set; skip.
    if (!setOpenRef.current) return;

    const id = nextId++;
    const entry: StackEntry = {
      id,
      close: () => setOpenRef.current?.(false),
    };
    stack.push(entry);
    attachListener();
    try {
      window.history.pushState({ __overlay: id }, '');
    } catch {
      // pushState can throw in sandboxed iframes or under unusual security
      // contexts; gracefully disable back-close in that case by un-pushing.
      stack.pop();
      if (stack.length === 0) detachListener();
      return;
    }

    return () => {
      const idx = stack.findIndex(e => e.id === id);
      if (idx === -1) {
        // Already removed by a popstate (back press). History is clean.
        if (stack.length === 0) detachListener();
        return;
      }
      // Programmatic close. Remove our entry and pop our sentinel from
      // history without re-firing close. We only pop history if our state
      // is still on top — if a later overlay was pushed after us, leave
      // the orphan entry alone (worst case: one wasted back press).
      stack.splice(idx, 1);
      const current = window.history.state as { __overlay?: number } | null;
      if (current?.__overlay === id) {
        suppressPop = true;
        try { window.history.back(); } catch { suppressPop = false; }
      }
      if (stack.length === 0) detachListener();
    };
  }, [open]);
}
