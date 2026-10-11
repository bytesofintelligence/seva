import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables:', {
    url: supabaseUrl ? 'set' : 'MISSING',
    key: supabaseAnonKey ? 'set' : 'MISSING',
  });
  throw new Error(
    'Supabase environment variables not configured. Check .env file and ensure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are set.'
  );
}

const memoryStorage = {
  data: new Map<string, string>(),
  getItem: async (key: string) => memoryStorage.data.get(key) ?? null,
  setItem: async (key: string, value: string) => memoryStorage.data.set(key, value),
  removeItem: async (key: string) => memoryStorage.data.delete(key),
};

const createStorage = () => {
  return {
    getItem: async (key: string) => {
      try {
        return await AsyncStorage.getItem(key);
      } catch {
        return await memoryStorage.getItem(key);
      }
    },
    setItem: async (key: string, value: string) => {
      try {
        await AsyncStorage.setItem(key, value);
      } catch {
        await memoryStorage.setItem(key, value);
      }
    },
    removeItem: async (key: string) => {
      try {
        await AsyncStorage.removeItem(key);
      } catch {
        await memoryStorage.removeItem(key);
      }
    },
  };
};

const isWeb = Platform.OS === 'web';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: createStorage(),
    // Access tokens expire (1h by default). Without this the session silently
    // dies mid-use and every query starts failing until the app is restarted.
    autoRefreshToken: true,
    persistSession: true,
    // On native there is no URL bar for Supabase to read the callback from —
    // src/app/auth/callback.tsx processes the deep link explicitly instead.
    detectSessionInUrl: isWeb,
    // PKCE is the recommended flow for mobile: the email link carries a
    // one-time `code` that is worthless without the verifier held on-device.
    flowType: 'pkce',
  },
});

// Supabase's documented React Native pattern: the JS timer that drives token
// refresh does not run reliably while the app is backgrounded, so refresh is
// stopped on background and restarted (with an immediate refresh) on
// foreground. Without this, returning to a long-backgrounded app leaves you
// holding an expired access token.
if (!isWeb) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });

  if (AppState.currentState === 'active') {
    supabase.auth.startAutoRefresh();
  }
}
