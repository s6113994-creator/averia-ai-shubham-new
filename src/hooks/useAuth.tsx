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
      typeof window !== 'undefined' &&
      (window.location.search.includes('code=') ||
       window.location.hash.includes('access_token='));

    const stripOAuthParams = () => {
      if (typeof window === 'undefined') return;
      try {
        const url = new URL(window.location.href);
        if (
          url.searchParams.has('code') ||
          url.searchParams.has('state') ||
          url.searchParams.has('error') ||
          url.searchParams.has('error_code') ||
          url.searchParams.has('error_description') ||
          url.hash.includes('access_token=')
        ) {
          url.searchParams.delete('code');
          url.searchParams.delete('state');
          url.searchParams.delete('error');
          url.searchParams.delete('error_code');
          url.searchParams.delete('error_description');
          url.hash = '';
          const newSearch = url.searchParams.toString();
          const cleanUrl = url.pathname + (newSearch ? `?${newSearch}` : '');
          window.history.replaceState(null, '', cleanUrl);
        }
      } catch (e) {
        console.error('Failed to clean OAuth params:', e);
      }
    };

    // 1. Attach onAuthStateChange listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, currentSession) => {
        if (!mounted) return;

        if (currentSession?.user) {
          setSession(currentSession);
          setUser(currentSession.user);
          setLoading(false);
          stripOAuthParams();
          return;
        }

        if (event === 'SIGNED_OUT') {
          setSession(null);
          setUser(null);
          setLoading(false);
          return;
        }

        // If INITIAL_SESSION has no session yet but we are resolving an OAuth callback,
        // keep loading: true while Supabase's detectSessionInUrl handler completes.
        if (event === 'INITIAL_SESSION' && !currentSession && hasOAuthCallback) {
          return;
        }

        if (!hasOAuthCallback) {
          setSession(null);
          setUser(null);
          setLoading(false);
        }
      }
    );

    // 2. Fetch session (getSession internally waits for initializePromise and detectSessionInUrl)
    supabase.auth.getSession().then(({ data: { session: existingSession }, error }) => {
      if (!mounted) return;
      if (error) console.error('Get session error:', error);

      if (existingSession?.user) {
        setSession(existingSession);
        setUser(existingSession.user);
        setLoading(false);
        stripOAuthParams();
      } else if (!hasOAuthCallback) {
        setSession(null);
        setUser(null);
        setLoading(false);
      } else {
        // If an OAuth callback code was in the URL, wait a brief safety window for the in-flight
        // token exchange before releasing loading.
        const safetyTimer = setTimeout(async () => {
          if (!mounted) return;
          const { data: { session: fallbackSession } } = await supabase.auth.getSession();
          if (!mounted) return;
          if (fallbackSession?.user) {
            setSession(fallbackSession);
            setUser(fallbackSession.user);
            stripOAuthParams();
          } else {
            stripOAuthParams();
          }
          setLoading(false);
        }, 2500);

        return () => clearTimeout(safetyTimer);
      }
    });

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
