import type { UserRole } from "@/types/auth";

export function homeRouteForRole(role: UserRole): string {
  switch (role) {
    case "student":
      return "/class";
    case "teacher":
      return "/dashboard";
    case "admin":
      return "/admin";
  }
}
