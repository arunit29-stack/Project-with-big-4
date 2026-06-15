export type UserRole = "student" | "teacher" | "admin";

export interface AuthUser {
  id: string;
  role: UserRole;
  email: string;
  institutionId?: string;
}

export type AuthStatus =
  | "idle"
  | "loading"
  | "authenticated"
  | "unauthenticated";

export interface AuthState {
  token: string | null;
  user: AuthUser | null;
  status: AuthStatus;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface ServerConfig {
  institutionSSOConfigured: boolean;
  institutionName?: string;
}
