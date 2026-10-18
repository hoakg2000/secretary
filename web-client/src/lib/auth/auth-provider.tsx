"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "@/i18n/navigation";
import { getAccessToken, refreshAccessToken, setAccessToken, setAuthLostHandler } from "@/lib/api/client";
import * as authApi from "@/lib/api/endpoints/auth";
import type { AuthUser } from "@/lib/api/types";

type Status = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  status: Status;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  const clear = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStatus("unauthenticated");
    queryClient.clear();
  }, [queryClient]);

  // Session lost mid-use (refresh failed): drop state and go to the login page.
  useEffect(() => {
    setAuthLostHandler(() => {
      clear();
      router.replace("/login");
    });
    return () => setAuthLostHandler(null);
  }, [clear, router]);

  // Restore on mount: the refresh cookie is the only thing that survives a reload.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // a remount (e.g. language switch) already has a token: skip an extra rotation
        if (getAccessToken() || (await refreshAccessToken())) {
          const session = await authApi.getSession();
          if (cancelled) return;
          setUser({ id: session.user.id, email: session.user.email });
          setStatus("authenticated");
          return;
        }
      } catch {
        // fall through to unauthenticated
      }
      if (!cancelled) {
        setAccessToken(null);
        setStatus("unauthenticated");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await authApi.login({ email, password });
    setAccessToken(result.accessToken);
    setUser(result.user);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // the local session is cleared either way
    }
    clear();
    router.replace("/login");
  }, [clear, router]);

  const value = useMemo(() => ({ status, user, login, logout }), [status, user, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
