export type Role = "admin" | "teacher" | "student";

export interface AuthClaims {
  sub: string;
  email: string;
  role: Role;
  institutionId: string;
  iat: number;
  exp: number;
  jti: string;
}

export interface AuthContext {
  userId: string;
  email: string;
  role: Role;
  institutionId: string;
  jti: string;
  issuedAt: number;
  expiresAt: number;
}

export interface AuthenticatedRequestContext extends AuthContext {
  token: string;
}
