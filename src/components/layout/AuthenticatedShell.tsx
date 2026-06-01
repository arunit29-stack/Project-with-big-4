"use client";

import { TopNav } from "@/components/layout/TopNav";
import { NotificationsProvider } from "@/contexts/NotificationsContext";
import type { ReactNode } from "react";

interface AuthenticatedShellProps {
  children: ReactNode;
  wide?: boolean;
}

export function AuthenticatedShell({ children, wide }: AuthenticatedShellProps) {
  return (
    <NotificationsProvider>
      <div className="min-h-screen bg-slate-50">
        <TopNav />
        <main
          className={`mx-auto px-4 py-8 ${wide ? "max-w-7xl" : "max-w-6xl"}`}
        >
          {children}
        </main>
      </div>
    </NotificationsProvider>
  );
}
