"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useServerConfig } from "@/hooks/useServerConfig";
import { homeRouteForRole } from "@/lib/auth/redirects";
import { useRouter } from "next/navigation";
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
    <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="mb-6 text-center text-2xl font-semibold text-slate-900">
        Sign in to CBB
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="mb-1 block text-sm font-medium text-slate-700"
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
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-brand-500 focus:border-brand-500 focus:ring-2"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="mb-1 block text-sm font-medium text-slate-700"
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
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-brand-500 focus:border-brand-500 focus:ring-2"
          />
        </div>

        {loginError && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {loginError}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || status === "loading"}
          className="w-full rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
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
          className="mt-4 w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Sign in with {institutionLabel} SSO
        </button>
      )}
    </div>
  );
}
