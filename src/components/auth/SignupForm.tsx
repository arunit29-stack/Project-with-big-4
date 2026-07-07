"use client";

import { useAuth } from "@/contexts/AuthContext";
import { homeRouteForRole } from "@/lib/auth/redirects";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import type { UserRole } from "@/types/auth";

export function SignupForm() {
  const { status, user } = useAuth();
  const router = useRouter();
  
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("student");
  
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authenticated" && user) {
      router.replace(homeRouteForRole(user.role));
    }
  }, [status, user, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, role }),
      });

      if (!res.ok) {
        const data = await res.json();
        setErrorMsg(data.error || "Failed to sign up.");
        setSubmitting(false);
        return;
      }
      
      // If signup is successful, we can redirect to login or automatically log them in.
      // Since the signup endpoint returns a token, we could update the AuthContext, 
      // but the easiest path is just reloading the page or sending them to login, 
      // or we can let the app handle it by redirecting to login to manually login.
      router.push("/login?registered=true");
    } catch (err) {
      setErrorMsg("An unexpected error occurred. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <>
      <h1 className="mb-6 text-center text-2xl font-bold tracking-tight text-slate-900">
        Create an Account
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="name"
            className="mb-1 block text-sm font-bold text-slate-700"
          >
            Full Name
          </label>
          <input
            id="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-white/50 bg-white/40 px-4 py-2.5 text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white/80 focus:ring-4 focus:ring-blue-500/10 backdrop-blur-sm shadow-inner"
          />
        </div>

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
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-white/50 bg-white/40 px-4 py-2.5 text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white/80 focus:ring-4 focus:ring-blue-500/10 backdrop-blur-sm shadow-inner"
          />
        </div>

        <div>
          <label
            htmlFor="role"
            className="mb-1 block text-sm font-bold text-slate-700"
          >
            I am a...
          </label>
          <select
            id="role"
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="w-full rounded-xl border border-white/50 bg-white/40 px-4 py-2.5 text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white/80 focus:ring-4 focus:ring-blue-500/10 backdrop-blur-sm shadow-inner bg-transparent"
          >
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
          </select>
        </div>

        {errorMsg && (
          <p
            role="alert"
            className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700 font-medium"
          >
            {errorMsg}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || status === "loading"}
          className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 font-semibold text-white transition-all duration-200 hover:from-blue-700 hover:to-indigo-700 shadow-md shadow-blue-500/15 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting || status === "loading" ? "Signing up…" : "Sign Up"}
        </button>
      </form>
    </>
  );
}
