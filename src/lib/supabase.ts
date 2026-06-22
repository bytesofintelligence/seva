import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

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

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: createStorage(),
    autoRefreshToken: false,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
