import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { appActions } from "@/store/app-store";

type UserRole = 'admin' | 'user';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  role: UserRole | null;
  loading: boolean;
  signInWithPassword: (args: { email: string; password: string }) => Promise<void>;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserRole = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();

      if (error) {
        setRole('user');
        return;
      }
      setRole((data?.role as UserRole) ?? 'user');
    } catch {
      setRole('user');
    }
  };

  const initializedRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    // Supabase v2: onAuthStateChange fires INITIAL_SESSION immediately on
    // registration with whatever session is in localStorage. This is more
    // reliable than getSession() for restoring a session across page refreshes.
    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;

      setSession(nextSession ?? null);

      if (nextSession?.user?.id) {
        void fetchUserRole(nextSession.user.id);
      } else {
        setRole(null);
      }

      // Resolve the loading state on the first event (INITIAL_SESSION).
      // All subsequent events (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED…) don't
      // need to touch loading — the UI is already visible at that point.
      if (!initializedRef.current) {
        initializedRef.current = true;
        setLoading(false);
      }
    });

    // Fallback: if onAuthStateChange never fires (edge case with some SDK
    // versions or network errors), force loading=false after 8 s.
    const timer = setTimeout(() => {
      if (mounted && !initializedRef.current) {
        initializedRef.current = true;
        setLoading(false);
      }
    }, 8000);

    return () => {
      mounted = false;
      clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const userId = session?.user?.id ?? null;
    appActions.setCurrentUser(userId);
    if (userId) {
      void appActions.loadPersistedForUser(userId);
    }
  }, [session?.user?.id]);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    role,
    loading,
    signInWithPassword: async ({ email, password }) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    signOut: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
    refreshRole: async () => {
      if (session?.user?.id) {
        await fetchUserRole(session.user.id);
      }
    },
  }), [loading, session, role]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
