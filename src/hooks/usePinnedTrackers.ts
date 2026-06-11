import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// Home page bento pins. Source of truth is profiles.pinned_tracker_ids
// (synced across devices); localStorage mirrors it so the selection works
// instantly on load and keeps functioning if the migration that adds the
// column hasn't been applied yet.

const STORAGE_KEY = 'expensesync-pinned-trackers';
export const MAX_PINS = 3;

function readLocal(userId: string): string[] {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const v = data[userId];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, MAX_PINS) : [];
  } catch { return []; }
}

function writeLocal(userId: string, ids: string[]) {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    data[userId] = ids;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

/**
 * Pinned tracker ids for the Home bento (max 3; order matters — index 0 is
 * the hero tile). `togglePin` is optimistic: state + localStorage update
 * immediately, the profile row syncs best-effort in the background.
 */
export function usePinnedTrackers() {
  const { user, profile } = useAuth();
  const userId = user?.id ?? '';
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => (userId ? readLocal(userId) : []));

  // Once the profile arrives, the DB value wins (it's the cross-device truth).
  // Profiles fetched before the migration won't have the field — keep local.
  useEffect(() => {
    if (!userId) return;
    const fromDb = profile?.pinned_tracker_ids;
    if (Array.isArray(fromDb)) {
      const ids = fromDb.slice(0, MAX_PINS);
      setPinnedIds(ids);
      writeLocal(userId, ids);
    } else {
      setPinnedIds(readLocal(userId));
    }
  }, [userId, profile]);

  const togglePin = useCallback((trackerId: string) => {
    setPinnedIds(prev => {
      let next: string[];
      if (prev.includes(trackerId)) {
        next = prev.filter(id => id !== trackerId);
      } else if (prev.length >= MAX_PINS) {
        toast(`You can pin up to ${MAX_PINS} trackers — unpin one first`);
        return prev;
      } else {
        next = [...prev, trackerId];
      }
      if (userId) {
        writeLocal(userId, next);
        // PGRST204 = column missing (migration not applied) — local copy
        // carries the feature until then, so stay quiet about it.
        void supabase
          .from('profiles')
          .update({ pinned_tracker_ids: next } as never)
          .eq('id', userId)
          .then(({ error }) => {
            if (error && error.code !== 'PGRST204' && error.code !== '42703') {
              console.warn('Pin sync failed:', error.message);
            }
          });
      }
      return next;
    });
  }, [userId]);

  return { pinnedIds, togglePin };
}
