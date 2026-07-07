"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useServerConfig } from "@/hooks/useServerConfig";
import { homeRouteForRole } from "@/lib/auth/redirects";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

export function LoginForm() {
  const { login, loginError, clearLoginError, status, user } = useAuth();
  const { config } = useServerConfig();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === "authenticated" && user) {
      router.replace(homeRouteForRole(user.role));
    }
  }, [status, user, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    clearLoginError();
    setSubmitting(true);
    await login(email.trim(), password);
    setSubmitting(false);
  }

  const institutionLabel = config?.institutionName ?? "Institution";

  return (
    <>
      <h1 className="mb-6 text-center text-2xl font-bold tracking-tight text-slate-900">
        Sign in to CBB
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="mb-1 block text-sm font-bold text-slate-700"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-white/50 bg-white/40 px-4 py-2.5 text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white/80 focus:ring-4 focus:ring-blue-500/10 backdrop-blur-sm shadow-inner"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="mb-1 block text-sm font-bold text-slate-700"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-white/50 bg-white/40 px-4 py-2.5 text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white/80 focus:ring-4 focus:ring-blue-500/10 backdrop-blur-sm shadow-inner"
          />
        </div>

        {loginError && (
          <p
            role="alert"
            className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700 font-medium"
          >
            {loginError}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || status === "loading"}
          className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 font-semibold text-white transition-all duration-200 hover:from-blue-700 hover:to-indigo-700 shadow-md shadow-blue-500/15 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting || status === "loading" ? "Signing in…" : "Sign In"}
        </button>
      </form>

      {config?.institutionSSOConfigured && (
        <button
          type="button"
          onClick={() => {
            window.location.href = "/api/auth/sso";
          }}
          className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Sign in with {institutionLabel} SSO
        </button>
      )}
    </>
  );
}
