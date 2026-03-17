import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';

const STORAGE_KEY = 'expensesync-nudges-seen';

function getSeenNudges(userId: string): Set<string> {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return new Set(data[userId] || []);
  } catch {
    return new Set();
  }
}

function markNudgeSeen(userId: string, key: string) {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const seen = new Set(data[userId] || []);
    seen.add(key);
    data[userId] = Array.from(seen);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

/**
 * Returns { show, dismiss } for a given nudge key.
 * The nudge shows only once per user (persisted in localStorage keyed by user ID).
 * `show` becomes true after `delayMs` (default 1500ms) if the nudge hasn't been seen.
 */
export function useNudge(key: string, delayMs = 1500) {
  const { user } = useAuth();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!user) return;
    const seen = getSeenNudges(user.id);
    if (seen.has(key)) return;

    const timer = setTimeout(() => setShow(true), delayMs);
    return () => clearTimeout(timer);
  }, [user, key, delayMs]);

  const dismiss = useCallback(() => {
    setShow(false);
    if (user) markNudgeSeen(user.id, key);
  }, [user, key]);

  return { show, dismiss };
}
