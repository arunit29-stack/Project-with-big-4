import type { AuthState, AuthUser } from "@/types/auth";

export type AuthAction =
  | { type: "AUTH_BOOTSTRAP" }
  | { type: "AUTH_START" }
  | { type: "AUTH_SUCCESS"; payload: { token: string; user: AuthUser } }
  | { type: "AUTH_FAILURE" }
  | { type: "AUTH_LOGOUT" }
  | { type: "AUTH_IDLE" };

export const initialAuthState: AuthState = {
  token: null,
  user: null,
  status: "idle",
};

export function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "AUTH_BOOTSTRAP":
      return { token: null, user: null, status: "unauthenticated" };
    case "AUTH_START":
      return { ...state, status: "loading" };
    case "AUTH_SUCCESS":
      return {
        token: action.payload.token,
        user: action.payload.user,
        status: "authenticated",
      };
    case "AUTH_FAILURE":
      return {
        token: null,
        user: null,
        status: "unauthenticated",
      };
    case "AUTH_LOGOUT":
      return {
        token: null,
        user: null,
        status: "unauthenticated",
      };
    case "AUTH_IDLE":
      return { ...initialAuthState, status: "idle" };
    default:
      return state;
  }
}
