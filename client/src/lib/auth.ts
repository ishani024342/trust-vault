import type { Role } from "./types";

const SESSION_KEY = "trustvault.session";
const TOKEN_KEY = "trustvault.jwt";

export interface Session {
  name?: string;
  email: string;
  role: Role;
  userId?: string;
  did?: string;
  /** True when running without a configured backend API. */
  local?: boolean;
}

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (!parsed.email || !parsed.role) return null;
    return {
      name: parsed.name,
      email: parsed.email,
      role: parsed.role.toUpperCase() as Role,
      userId: parsed.userId,
      did: parsed.did,
      local: parsed.local,
    };
  } catch {
    return null;
  }
}

export function setSession(session: Session): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(TOKEN_KEY);
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

/** Map a role to its console path. */
export function consolePathForRole(role: Role): string {
  switch (role) {
    case "ADMIN":
      return "/console/admin";
    case "MANAGER":
      return "/console/manager";
    case "AUDITOR":
      return "/console/auditor";
    default:
      return "/console/user";
  }
}

/** True when the app is running without a configured backend API base URL. */
export function isLocalMode(): boolean {
  return !(import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
}