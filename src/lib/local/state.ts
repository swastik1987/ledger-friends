import type { QueryClient } from '@tanstack/react-query';
import type { Profile } from '@/types';

// Lightweight shared state for the Android app's local store. Deliberately free
// of SQLite imports so App.tsx, AuthContext and the realtime hook can use it
// synchronously; the store itself (db.ts, sync.ts, reads.ts) is lazy-loaded.

let staleGen = 0;
let queryClient: QueryClient | null = null;

/**
 * Something changed on the server that the local store hasn't seen yet (a
 * mutation succeeded, or a realtime event arrived), so the next read must pull
 * first instead of trusting a pull from a moment ago.
 */
export function markStale(): void {
  staleGen++;
}

export function currentStaleGen(): number {
  return staleGen;
}

export function bindQueryClient(qc: QueryClient): void {
  queryClient = qc;
}

/** Re-runs every active query, which re-reads the local store. */
export function refreshQueries(): void {
  void queryClient?.invalidateQueries();
}

/** Sign-out: drops every cached query result, so no account data stays in memory either. */
export function clearQueries(): void {
  queryClient?.clear();
}

/**
 * Thrown by a local read when this device has never completed a pull and
 * can't reach the server now, so an empty result would be a lie ("No trackers
 * yet"). Screens show LoadError instead.
 */
export class LocalNotSyncedError extends Error {
  constructor() {
    super("This device hasn't downloaded your data yet. Connect to the internet and try again.");
    this.name = 'LocalNotSyncedError';
  }
}

// The signed-in user's profile, cached so an offline start still greets them
// by name and AddExpenseSheet (which needs `profile`) works. localStorage, not
// SQLite, because AuthContext needs it synchronously on startup.
const PROFILE_KEY = 'expensesync-profile-cache';

export function readCachedProfile(userId: string): Profile | null {
  try {
    const cached = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null');
    return cached && cached.id === userId ? (cached as Profile) : null;
  } catch {
    return null;
  }
}

export function writeCachedProfile(profile: Profile | null): void {
  try {
    if (profile) localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    else localStorage.removeItem(PROFILE_KEY);
  } catch {
    /* ignore */
  }
}
