import { supabase } from "@/lib/supabase";
import { Session } from "@supabase/supabase-js";
import React, { createContext, useContext, useEffect, useState } from "react";

interface SignUpOptions {
  data?: Record<string, any>;
}

interface AuthContextType {
  session: Session | null;
  loading: boolean;
  role: "volunteer" | "charity" | null;
  roleLoading: boolean;
  profileRefreshToken: number;
  markProfileUpdated: () => void;
  signUp: (
    email: string,
    password: string,
    options?: SignUpOptions,
  ) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<"volunteer" | "charity" | null>(null);
  const [roleLoading, setRoleLoading] = useState(false);
  const [profileRefreshToken, setProfileRefreshToken] = useState(0);

  // Fetch user's role from profiles table with retry
  const fetchUserRole = async (userId: string, retries = 3) => {
    setRoleLoading(true);
    try {
      for (let attempt = 0; attempt < retries; attempt++) {
        const { data, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", userId);

        if (error) {
          console.error(`Attempt ${attempt + 1}: Error fetching role:`, error);
        } else if (data && data.length > 0) {
          setRole(data[0]?.role as "volunteer" | "charity");
          return;
        }

        // If this isn't the last attempt, wait before retrying
        if (attempt < retries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      // After all retries, default to volunteer
      console.warn("Profile not found after retries, defaulting to volunteer");
      setRole("volunteer");
    } catch (err) {
      console.error("Error in fetchUserRole:", err);
      setRole("volunteer");
    } finally {
      setRoleLoading(false);
    }
  };

  useEffect(() => {
    const bootstrapAsync = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        setSession(session);
        if (session?.user.id) {
          await fetchUserRole(session.user.id);
        }
      } catch (err) {
        console.error("Error getting session:", err);
      } finally {
        setLoading(false);
      }
    };

    bootstrapAsync();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user.id) {
        fetchUserRole(session.user.id);
      } else {
        setRole(null);
      }
    });

    return () => subscription?.unsubscribe();
  }, []);

  const signUp = async (
    email: string,
    password: string,
    options?: SignUpOptions,
  ) => {
    const { error } = await supabase.auth.signUp({ email, password, options });
    if (error) throw error;
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const markProfileUpdated = () => {
    setProfileRefreshToken((current) => current + 1);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        role,
        roleLoading,
        profileRefreshToken,
        markProfileUpdated,
        signUp,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
