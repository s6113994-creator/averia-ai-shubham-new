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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, currentSession) => {
        if (!mounted) return;
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        setLoading(false);

        if (
          currentSession &&
          (window.location.search.includes('code=') || window.location.hash.includes('access_token='))
        ) {
          window.history.replaceState(null, '', window.location.pathname);
        }
      }
    );

    const bootstrapSession = async () => {
      try {
        const rawHash = window.location.hash;
        if (rawHash && rawHash.includes('access_token=')) {
          const params = new URLSearchParams(rawHash.replace(/^#/, ''));
          const access_token = params.get('access_token');
          const refresh_token = params.get('refresh_token') || '';

          window.history.replaceState(null, '', window.location.pathname + window.location.search);

          if (access_token) {
            const { data, error } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });
            if (!mounted) return;
            if (!error && data?.session) {
              setSession(data.session);
              setUser(data.session.user);
              setLoading(false);
              return;
            }
          }
        }

        // Explicitly handle PKCE auth code exchange for Google OAuth redirect
        const searchParams = new URLSearchParams(window.location.search);
        const code = searchParams.get('code');
        if (code) {
          try {
            const { data, error } = await supabase.auth.exchangeCodeForSession(window.location.href);
            if (!mounted) return;
            if (!error && data?.session) {
              setSession(data.session);
              setUser(data.session.user);
              setLoading(false);
              window.history.replaceState(null, '', window.location.pathname);
              return;
            } else if (error) {
              console.error('Code exchange error:', error);
            }
          } catch (err) {
            console.error('Code exchange exception:', err);
          }
        }

        const { data: { session: existing }, error } = await supabase.auth.getSession();
        if (!mounted) return;

        if (error) {
          console.error('Get session error:', error);
        }

        setSession(existing);
        setUser(existing?.user ?? null);
        setLoading(false);

        if (window.location.search.includes('code=')) {
          window.history.replaceState(null, '', window.location.pathname);
        }
      } catch (e) {
        console.error('Auth bootstrap failed:', e);
        if (mounted) setLoading(false);
      }
    };

    bootstrapSession();

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