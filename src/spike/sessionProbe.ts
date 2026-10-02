// Phase 0 spike (throwaway) — see docs/android-spike-runbook.md.
// Reads/edits the session supabase-js persists in localStorage. The generated
// client (src/integrations/supabase/client.ts) falls back to localStorage
// outside a Lovable preview iframe, which includes the Capacitor WebView.

// Matches sb-<project-ref>-auth-token but not its -code-verifier sibling.
const AUTH_KEY_RE = /^sb-.+-auth-token$/;

export interface StoredSessionInfo {
  userId: string | null;
  email: string | null;
  /** Unix seconds. */
  expiresAt: number | null;
  hasRefreshToken: boolean;
}

function findAuthKey(): string | null {
  return Object.keys(localStorage).find(k => AUTH_KEY_RE.test(k)) ?? null;
}

export function readStoredSession(): StoredSessionInfo | null {
  const key = findAuthKey();
  if (!key) return null;
  try {
    const s = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!s) return null;
    return {
      userId: s.user?.id ?? null,
      email: s.user?.email ?? null,
      expiresAt: typeof s.expires_at === 'number' ? s.expires_at : null,
      hasRefreshToken: typeof s.refresh_token === 'string' && s.refresh_token.length > 0,
    };
  } catch {
    return null;
  }
}

/**
 * Backdates the stored access token's expiry so the next cold start sees an
 * expired session — lets the offline-cold-start test (runbook Q3) run in
 * minutes instead of waiting out the 1-hour token lifetime. Force-stop the
 * app right after, before supabase-js's auto-refresh rewrites storage.
 */
export function expireStoredSession(): boolean {
  const key = findAuthKey();
  if (!key) return false;
  try {
    const s = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!s) return false;
    s.expires_at = Math.floor(Date.now() / 1000) - 60;
    localStorage.setItem(key, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}
