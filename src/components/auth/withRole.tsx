"use client";

import { useAuth } from "@/contexts/AuthContext";
import { homeRouteForRole } from "@/lib/auth/redirects";
import type { UserRole } from "@/types/auth";
import { useRouter } from "next/navigation";
import { useEffect, type ComponentType } from "react";

export function withRole<P extends object>(
  allowedRoles: UserRole[],
  Wrapped: ComponentType<P>,
) {
  function WithRoleComponent(props: P) {
    const { user, status } = useAuth();
    const router = useRouter();

    useEffect(() => {
      if (status !== "authenticated" || !user) return;

      if (!allowedRoles.includes(user.role)) {
        router.replace(homeRouteForRole(user.role));
      }
    }, [status, user, router]);

    if (status !== "authenticated" || !user) {
      return null;
    }

    if (!allowedRoles.includes(user.role)) {
      return null;
    }

    return <Wrapped {...props} />;
  }

  WithRoleComponent.displayName = `withRole(${Wrapped.displayName ?? Wrapped.name ?? "Component"})`;
  return WithRoleComponent;
}
