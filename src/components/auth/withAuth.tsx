"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, type ComponentType } from "react";

export function withAuth<P extends object>(Wrapped: ComponentType<P>) {
  function WithAuthComponent(props: P) {
    const { status } = useAuth();
    const router = useRouter();

    useEffect(() => {
      if (status === "unauthenticated") {
        router.replace("/login");
      }
    }, [status, router]);

    if (status === "idle" || status === "loading") {
      return (
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        </div>
      );
    }

    if (status !== "authenticated") {
      return null;
    }

    return <Wrapped {...props} />;
  }

  WithAuthComponent.displayName = `withAuth(${Wrapped.displayName ?? Wrapped.name ?? "Component"})`;
  return WithAuthComponent;
}
