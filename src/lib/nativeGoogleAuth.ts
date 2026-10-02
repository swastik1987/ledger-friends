import { SocialLogin } from '@capgo/capacitor-social-login';
import { supabase } from '@/integrations/supabase/client';

// Native (Android) Google sign-in. The web flow (lovable.auth.signInWithOAuth)
// sends the page to Lovable's relative /~oauth broker, which the Capacitor
// shell serves from its local bundle (→ 404), and Google refuses OAuth inside
// embedded WebViews anyway. Instead, Android's Credential Manager returns a
// Google ID token, which Supabase exchanges for a session.
//
// Requires Lovable Cloud's Google auth on "Your own credentials", so Supabase's
// Google provider trusts tokens issued for VITE_GOOGLE_WEB_CLIENT_ID — see
// docs/android-google-signin.md. Loaded via dynamic import from the Auth page,
// so the web bundle never pulls in the plugin.

// Web OAuth client ID (public, not a secret). Lives in .env.capacitor, which
// Vite loads only for `vite build --mode capacitor` (the native build).
const WEB_CLIENT_ID = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID as string | undefined;

let initPromise: Promise<void> | null = null;

function initialize(): Promise<void> {
  if (!WEB_CLIENT_ID) {
    return Promise.reject(new Error('Google sign-in is not configured (VITE_GOOGLE_WEB_CLIENT_ID missing).'));
  }
  if (!initPromise) {
    initPromise = SocialLogin.initialize({ google: { webClientId: WEB_CLIENT_ID, mode: 'online' } })
      .catch(err => {
        initPromise = null; // allow a retry
        throw err;
      });
  }
  return initPromise;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export async function signInWithGoogleNative(): Promise<{ error: Error | null }> {
  try {
    await initialize();
    // Replay protection: Google embeds the *hashed* nonce in the ID token and
    // Supabase hashes the raw nonce we pass it, rejecting the token on mismatch.
    const rawNonce = crypto.randomUUID();
    const res = await SocialLogin.login({
      provider: 'google',
      options: { nonce: await sha256Hex(rawNonce) },
    });
    const idToken = res.result.responseType === 'online' ? res.result.idToken : null;
    if (!idToken) return { error: new Error('Google did not return an ID token.') };

    const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken, nonce: rawNonce });
    return { error: error ?? null };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}
