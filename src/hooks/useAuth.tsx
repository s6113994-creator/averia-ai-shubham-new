import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const hasOAuthCallback =
      window.location.search.includes('code=') ||
      window.location.hash.includes('access_token=');

    // 1. Listen to Supabase's native auth state changes (handles PKCE & implicit OAuth automatically)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, currentSession) => {
        if (!mounted) return;

        // If OAuth callback is still in progress and session isn't ready on INITIAL_SESSION, wait for SIGNED_IN
        if (event === 'INITIAL_SESSION' && !currentSession && hasOAuthCallback) {
          return;
        }

        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        setLoading(false);

        // Clean OAuth params from URL only AFTER session is safely established
        if (
          currentSession &&
          (window.location.search.includes('code=') || window.location.hash.includes('access_token='))
        ) {
          window.history.replaceState(null, '', window.location.pathname);
        }
      }
    );

    // 2. Fallback session check (only if not waiting on an active OAuth code exchange)
    const initSession = async () => {
      if (hasOAuthCallback) {
        // Safety timeout: if OAuth fails/aborts after 6s, stop loading so UI doesn't hang
        setTimeout(async () => {
          if (!mounted) return;
          const { data: { session: fallbackSession } } = await supabase.auth.getSession();
          if (!mounted) return;
          setSession(fallbackSession);
          setUser(fallbackSession?.user ?? null);
          setLoading(false);
        }, 6000);
        return;
      }

      const { data: { session: existing }, error } = await supabase.auth.getSession();
      if (!mounted) return;
      if (error) console.error('Get session error:', error);

      setSession(existing);
      setUser(existing?.user ?? null);
      setLoading(false);
    };

    initSession();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, fullName?: string) => {
    const redirectUrl = `${window.location.origin}/auth`;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
        },
      },
    });
    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}