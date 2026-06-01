"use client";

import { useAuth } from "@/contexts/AuthContext";
import { UnassessedNavBadge } from "@/components/assignments/UnassessedNavBadge";
import { NotificationBell } from "@/components/notifications/NotificationBell";

export function TopNav() {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <span className="text-lg font-semibold text-brand-700">CBB</span>

        <div className="flex items-center gap-4">
          <UnassessedNavBadge />
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
