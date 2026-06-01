"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import { authReducer, initialAuthState } from "@/lib/auth/authReducer";
import { sendSessionBeacon } from "@/lib/auth/sessionBeacon";
import type { AuthUser, LoginResponse } from "@/types/auth";

const LOGIN_ERROR_MESSAGE =
  "Invalid email or password. Please try again.";

interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  status: typeof initialAuthState.status;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  loginError: string | null;
  clearLoginError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialAuthState);
  const [loginError, setLoginError] = useReducer(
    (_: string | null, next: string | null) => next,
    null as string | null,
  );

  const login = useCallback(async (email: string, password: string) => {
    setLoginError(null);
    dispatch({ type: "AUTH_START" });

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        dispatch({ type: "AUTH_FAILURE" });
        setLoginError(LOGIN_ERROR_MESSAGE);
        return;
      }

      const data = (await res.json()) as LoginResponse;
      dispatch({
        type: "AUTH_SUCCESS",
        payload: { token: data.token, user: data.user },
      });
    } catch {
      dispatch({ type: "AUTH_FAILURE" });
      setLoginError(LOGIN_ERROR_MESSAGE);
    }
  }, []);

  const logout = useCallback(() => {
    sendSessionBeacon(state.token);
    dispatch({ type: "AUTH_LOGOUT" });
  }, [state.token]);

  const clearLoginError = useCallback(() => setLoginError(null), []);

  // Memory-only token: refresh always starts unauthenticated (EXIT_ON_CLOSE).
  useEffect(() => {
    if (state.status === "idle") {
      dispatch({ type: "AUTH_BOOTSTRAP" });
    }
  }, [state.status]);

  // EXIT_ON_CLOSE: beacon on tab close / visibility hidden
  useEffect(() => {
    if (state.status !== "authenticated" || !state.token) {
      return;
    }

    const token = state.token;

    const onBeforeUnload = () => sendSessionBeacon(token);
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        sendSessionBeacon(token);
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [state.status, state.token]);

  const value = useMemo<AuthContextValue>(
    () => ({
      token: state.token,
      user: state.user,
      status: state.status,
      login,
      logout,
      loginError,
      clearLoginError,
    }),
    [state, login, logout, loginError, clearLoginError],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
