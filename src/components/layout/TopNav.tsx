"use client";

import { useAuth } from "@/contexts/AuthContext";
import { UnassessedNavBadge } from "@/components/assignments/UnassessedNavBadge";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import Link from "next/link";
import { homeRouteForRole } from "@/lib/auth/redirects";

export function TopNav() {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link
            href={user ? homeRouteForRole(user.role) : "/login"}
            className="text-lg font-bold text-brand-700 hover:text-brand-800"
          >
            CBB
          </Link>
          {user && (
            <nav className="flex items-center gap-4">
              {user.role === "student" && (
                <Link
                  href="/class"
                  className="text-sm font-medium text-slate-600 hover:text-slate-900"
                >
                  My Classes
                </Link>
              )}
              {(user.role === "teacher" || user.role === "admin") && (
                <Link
                  href="/dashboard"
                  className="text-sm font-medium text-slate-600 hover:text-slate-900"
                >
                  Dashboard
                </Link>
              )}
              {user.role === "admin" && (
                <Link
                  href="/admin"
                  className="text-sm font-medium text-slate-600 hover:text-slate-900"
                >
                  Admin
                </Link>
              )}
            </nav>
          )}
        </div>

        <div className="flex items-center gap-4">
          <NotificationBell />
          {user && (
            <div className="flex items-center gap-3">
              <span className="hidden text-sm text-slate-600 sm:inline">
                {user.email}
              </span>
              <button
                type="button"
                onClick={logout}
                className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

