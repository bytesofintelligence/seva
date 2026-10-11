import { supabase } from "@/lib/supabase";
import { getAuthRedirectUrl } from "@/lib/auth-links";
import { logAuthError, normaliseEmail } from "@/lib/auth-errors";
import { Session, User } from "@supabase/supabase-js";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

interface SignUpOptions {
  data?: Record<string, any>;
}

export interface SignUpResult {
  /** True when Supabase withheld the session pending email confirmation. */
  needsVerification: boolean;
}

export type UserRole = "volunteer" | "charity";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /**
   * Whether Supabase has confirmed this user's email address. Derived from
   * `user.email_confirmed_at` on every render — there is no local flag that
   * could drift from the server, and nothing in the app may set it.
   */
  emailVerified: boolean;
  /**
   * True between opening a password-recovery deep link and finishing (or
   * abandoning) the reset. While set, the router pins the user to
   * /reset-password so a recovery session can't be used to browse the app.
   */
  passwordRecovery: boolean;
  role: UserRole | null;
  roleLoading: boolean;
  profileRefreshToken: number;
  markProfileUpdated: () => void;
  signUp: (
    email: string,
    password: string,
    options?: SignUpOptions,
  ) => Promise<SignUpResult>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-reads the user from Supabase; use to pick up a verification done elsewhere. */
  refreshUser: () => Promise<boolean>;
  resendVerification: (email: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  /** Sets a new password for the current (recovery or normal) session. */
  updatePassword: (newPassword: string) => Promise<void>;
  /** Verifies the current password server-side, then sets the new one. */
  changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<void>;
  beginPasswordRecovery: () => void;
  endPasswordRecovery: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [profileRefreshToken, setProfileRefreshToken] = useState(0);

  // Guards against a late role fetch for a signed-out user clobbering state.
  const activeUserIdRef = useRef<string | null>(null);

  // Fetch the user's role from the profiles table, with retry — the row is
  // created by an AFTER INSERT trigger on auth.users, so immediately after
  // signup it can lag the session by a few hundred milliseconds.
  //
  // NOTE: this drives *navigation only*. It is not an authorisation decision.
  // Every privileged action is gated in Postgres by RLS keyed on
  // `charities.owner_id = auth.uid()`, never on this value.
  const fetchUserRole = useCallback(async (userId: string, retries = 3) => {
    setRoleLoading(true);
    try {
      for (let attempt = 0; attempt < retries; attempt++) {
        if (activeUserIdRef.current !== userId) return;

        const { data, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", userId);

        if (error) {
          logAuthError(`role-fetch-${attempt + 1}`, error);
        } else if (data && data.length > 0) {
          if (activeUserIdRef.current === userId) {
            setRole(data[0]?.role as UserRole);
          }
          return;
        }

        if (attempt < retries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      // Fall back to the least-privileged role. A charity owner who lands here
      // sees volunteer navigation, which is recoverable; the reverse would show
      // coordinator UI to a volunteer (whose writes the database would reject
      // anyway, but which would be confusing and look like a bug).
      if (activeUserIdRef.current === userId) {
        setRole("volunteer");
      }
    } catch (err) {
      logAuthError("role-fetch", err);
      if (activeUserIdRef.current === userId) {
        setRole("volunteer");
      }
    } finally {
      if (activeUserIdRef.current === userId) {
        setRoleLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const bootstrapAsync = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (cancelled) return;
        activeUserIdRef.current = session?.user.id ?? null;
        setSession(session);
        if (session?.user.id) {
          await fetchUserRole(session.user.id);
        }
      } catch (err) {
        logAuthError("bootstrap", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    bootstrapAsync();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // Supabase emits PASSWORD_RECOVERY when a recovery link establishes a
      // session. On native we also set this explicitly from the callback
      // screen, because verifyOtp/exchangeCodeForSession report SIGNED_IN.
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecovery(true);
      }
      if (event === "SIGNED_OUT") {
        setPasswordRecovery(false);
      }

      const nextUserId = nextSession?.user.id ?? null;
      const userChanged = activeUserIdRef.current !== nextUserId;
      activeUserIdRef.current = nextUserId;
      setSession(nextSession);

      if (nextUserId) {
        // TOKEN_REFRESHED / USER_UPDATED fire often; only refetch on a real
        // account change so we don't hammer the profiles table.
        if (userChanged) fetchUserRole(nextUserId);
      } else {
        setRole(null);
        setRoleLoading(false);
      }
    });

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, [fetchUserRole]);

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      options?: SignUpOptions,
    ): Promise<SignUpResult> => {
      const { data, error } = await supabase.auth.signUp({
        email: normaliseEmail(email),
        password,
        options: {
          ...options,
          emailRedirectTo: getAuthRedirectUrl(),
        },
      });
      if (error) throw error;

      // With "Confirm email" enabled Supabase returns a user but no session.
      // That absence is what keeps an unverified account out of the app — the
      // client never decides this.
      return { needsVerification: !data.session };
    },
    [],
  );

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: normaliseEmail(email),
      password,
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    setPasswordRecovery(false);
    const { error } = await supabase.auth.signOut();
    // A "session missing"/network failure on sign-out must still clear local
    // state, otherwise the user is stuck in a signed-in shell they can't use.
    if (error) {
      logAuthError("sign-out", error);
      activeUserIdRef.current = null;
      setSession(null);
      setRole(null);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      logAuthError("refresh-user", error);
      return false;
    }
    if (data.user) {
      // Pull a fresh session so `session.user` (what the app reads) carries the
      // updated email_confirmed_at rather than the stale cached copy.
      const { data: refreshed } = await supabase.auth.refreshSession();
      if (refreshed.session) setSession(refreshed.session);
      return Boolean(data.user.email_confirmed_at);
    }
    return false;
  }, []);

  const resendVerification = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: normaliseEmail(email),
      options: { emailRedirectTo: getAuthRedirectUrl() },
    });
    if (error) throw error;
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(
      normaliseEmail(email),
      { redirectTo: getAuthRedirectUrl("recovery") },
    );
    if (error) throw error;
  }, []);

  const updatePassword = useCallback(async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  }, []);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const email = user?.email;
      if (!email) {
        throw Object.assign(new Error("Auth session missing"), {
          code: "session_not_found",
        });
      }

      // Verify the current password server-side. Supabase has no "check this
      // password" endpoint, so we re-authenticate: signInWithPassword is
      // evaluated entirely by GoTrue against the stored hash. Nothing is
      // compared locally, and the password is never persisted anywhere.
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (verifyError) throw verifyError;

      // The re-auth above also refreshes the session, which satisfies
      // Supabase's "Secure password change" recent-login requirement.
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;
    },
    [],
  );

  const beginPasswordRecovery = useCallback(() => setPasswordRecovery(true), []);
  const endPasswordRecovery = useCallback(() => setPasswordRecovery(false), []);

  const markProfileUpdated = useCallback(
    () => setProfileRefreshToken((current) => current + 1),
    [],
  );

  const user = session?.user ?? null;
  const emailVerified = Boolean(user?.email_confirmed_at);

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        loading,
        emailVerified,
        passwordRecovery,
        role,
        roleLoading,
        profileRefreshToken,
        markProfileUpdated,
        signUp,
        signIn,
        signOut,
        refreshUser,
        resendVerification,
        sendPasswordReset,
        updatePassword,
        changePassword,
        beginPasswordRecovery,
        endPasswordRecovery,
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
