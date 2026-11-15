import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://qhmxmwigvexyxvklukns.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Safe and reliable browser localStorage access
const getBrowserStorage = () => {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const testKey = '__sb_test__';
      window.localStorage.setItem(testKey, testKey);
      window.localStorage.removeItem(testKey);
      return window.localStorage;
    } catch {
      return window.localStorage;
    }
  }
  return undefined;
};

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: getBrowserStorage(),
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  }
});
