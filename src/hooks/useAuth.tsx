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
    const urlParams = new URLSearchParams(window.location.search);
    const authCode = urlParams.get('code');
    const hasHashToken =
      window.location.hash.includes('access_token=') ||
      window.location.hash.includes('refresh_token=');

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, currentSession) => {
        if (!mounted) return;
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
          if (currentSession) {
            if (window.location.hash.includes('access_token') || window.location.search.includes('code=')) {
              window.history.replaceState(null, '', window.location.pathname);
            }
            setSession(currentSession);
            setUser(currentSession.user);
            setLoading(false);
            return;
          }
        }
        if (event === 'SIGNED_OUT') {
          setSession(null);
          setUser(null);
          setLoading(false);
        }
      }
    );

    const initAuth = async () => {
      try {
        if (authCode) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(authCode);
          if (!mounted) return;
          if (!error && data?.session) {
            window.history.replaceState(null, '', window.location.pathname);
            setSession(data.session);
            setUser(data.session.user);
            setLoading(false);
            return;
          }
        }

        const { data: { session: existingSession } } = await supabase.auth.getSession();
        if (!mounted) return;

        if (!existingSession && hasHashToken) {
          // Wait up to 3 seconds for onAuthStateChange to parse hash token
          setTimeout(() => {
            if (mounted) setLoading(false);
          }, 3000);
          return;
        }

        setSession(existingSession);
        setUser(existingSession?.user ?? null);
        setLoading(false);
      } catch (err) {
        console.error('[Auth] Init error:', err);
        if (mounted) setLoading(false);
      }
    };

    initAuth();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, fullName?: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
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
