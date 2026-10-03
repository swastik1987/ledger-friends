import type { User } from '@supabase/supabase-js';

// The generated Supabase client persists its session in localStorage under
// sb-<project-ref>-auth-token (src/integrations/supabase/client.ts, outside a
// Lovable preview iframe, which includes the Android WebView). Reading it
// directly lets the Android app know who is signed in without waiting for
// supabase-js, which offline can spend about a minute retrying a token refresh
// before reporting no session at all (Android spike, Q3).

// Matches sb-<project-ref>-auth-token but not its -code-verifier sibling.
const AUTH_KEY_RE = /^sb-.+-auth-token$/;

function findAuthKey(): string | null {
  try {
    return Object.keys(localStorage).find(k => AUTH_KEY_RE.test(k)) ?? null;
  } catch {
    return null;
  }
}

/**
 * The signed-in user from the persisted session, or null. A session counts
 * only while it still holds a refresh token: supabase-js deletes the whole
 * entry on a real sign-out or when the server rejects the refresh token, but
 * keeps it through network failures.
 */
export function readStoredUser(): User | null {
  const key = findAuthKey();
  if (!key) return null;
  try {
    const s = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!s || typeof s.refresh_token !== 'string' || !s.refresh_token) return null;
    return s.user && typeof s.user.id === 'string' ? (s.user as User) : null;
  } catch {
    return null;
  }
}

/**
 * Drops the persisted session. Only for signing out while offline: supabase-js
 * keeps the session when its sign-out request can't reach the server, and its
 * in-memory copy survives until the page reloads.
 */
export function clearStoredSession(): void {
  const key = findAuthKey();
  if (!key) return;
  try {
    localStorage.removeItem(key);
    localStorage.removeItem(`${key}-code-verifier`);
  } catch {
    /* ignore */
  }
}
