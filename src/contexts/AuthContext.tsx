import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Profile } from '@/types';
import { isNativeApp } from '@/lib/platform';
import { clearStoredSession, readStoredUser } from '@/lib/storedSession';
import { clearQueries, readCachedProfile, writeCachedProfile } from '@/lib/local/state';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  /** Resolves false if the user cancelled (Android app: unsynced changes). */
  signOut: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  session: null,
  loading: true,
  signOut: async () => true,
});

export const useAuth = () => useContext(AuthContext);

// Android app: start from the session persisted on the device instead of
// waiting for supabase-js. Offline with an expired access token, supabase-js
// retries the refresh for about a minute and then reports no session, although
// the refresh token is still stored (Android spike, Q3). The stored user keeps
// the app signed in and showing local data until a refresh succeeds. Requests
// still need a real token, so the server's RLS is unaffected.
const storedUser = isNativeApp ? readStoredUser() : null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(storedUser);
  const [profile, setProfile] = useState<Profile | null>(() => (storedUser ? readCachedProfile(storedUser.id) : null));
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!storedUser);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    // Set up auth state listener - handles INITIAL_SESSION automatically
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[Auth] event:', event, 'session:', !!session);
        if (!mounted.current) return;

        if (!session && isNativeApp) {
          // supabase-js deletes the stored session on a real sign-out or a
          // rejected refresh token. If it's still there, the refresh just
          // couldn't reach the server: stay signed in on the stored user.
          const offlineUser = readStoredUser();
          if (offlineUser) {
            setSession(null);
            setUser(prev => (prev?.id === offlineUser.id ? prev : offlineUser));
            setProfile(prev => prev ?? readCachedProfile(offlineUser.id));
            setLoading(false);
            return;
          }
        }

        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Use setTimeout to avoid Supabase deadlock on initial load
          setTimeout(async () => {
            if (!mounted.current) return;
            const { data } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .single();
            if (!mounted.current) return;
            if (isNativeApp) {
              // Offline the fetch fails; keep the cached profile rather than losing the name.
              if (data) writeCachedProfile(data as Profile);
              setProfile((data as Profile | null) ?? readCachedProfile(session.user.id));
            } else {
              setProfile(data as Profile | null);
            }
            setLoading(false);
          }, 0);
        } else {
          setProfile(null);
          setLoading(false);
        }
      }
    );

    return () => {
      mounted.current = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    // Android app: signing out wipes the local store, including changes not
    // yet pushed. Try to push them first, and ask before discarding the rest.
    if (isNativeApp) {
      const outbox = await import('@/lib/local/outbox');
      if (navigator.onLine) {
        await Promise.race([
          outbox.pushOutbox().catch(() => undefined),
          new Promise(resolve => setTimeout(resolve, 10_000)),
        ]);
      }
      const { pending, failed } = await outbox.readSyncCounts();
      const unsynced = pending + failed;
      if (unsynced > 0 && !window.confirm(
        `${unsynced} change${unsynced === 1 ? " hasn't" : "s haven't"} synced yet. Signing out will discard ${unsynced === 1 ? 'it' : 'them'}. Sign out anyway?`,
      )) {
        return false;
      }
    }

    // Offline with an expired token, supabase-js can spend about a minute
    // retrying the refresh before it even tries to sign out.
    const { error } = isNativeApp
      ? await Promise.race([
          supabase.auth.signOut(),
          new Promise<{ error: Error }>(resolve =>
            setTimeout(() => resolve({ error: new Error('Sign-out timed out') }), 5_000)),
        ])
      : await supabase.auth.signOut();
    if (isNativeApp) {
      writeCachedProfile(null);
      clearQueries();
      await (await import('@/lib/local/sync')).clearLocalData().catch(err => console.warn('[local] wipe failed:', err));
      if (error) {
        // Offline, supabase-js keeps the session when the server can't be
        // reached. Drop it from storage and reload, which also resets
        // supabase-js's in-memory copy.
        clearStoredSession();
        window.location.replace('/');
        return true;
      }
    }
    setUser(null);
    setProfile(null);
    setSession(null);
    return true;
  };

  return (
    <AuthContext.Provider value={{ user, profile, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
