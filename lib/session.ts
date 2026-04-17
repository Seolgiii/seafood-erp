"use client";

export const SESSION_STORAGE_KEY = "seafood_erp_worker_session";
export const SESSION_IDLE_MS = 30 * 60 * 1000;

export type WorkerSession = {
  workerId: string;
  workerName: string;
  role?: string;
  lastActivityAt: number;
};

export function readSession(): WorkerSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkerSession;
    if (
      typeof parsed.workerId !== "string" ||
      typeof parsed.workerName !== "string" ||
      typeof parsed.lastActivityAt !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeSession(session: WorkerSession): void {
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

export function isSessionExpired(session: WorkerSession | null): boolean {
  if (!session) return true;
  return Date.now() - session.lastActivityAt >= SESSION_IDLE_MS;
}

const ADMIN_ROLES = ["ADMIN", "MASTER"] as const;

/** ADMIN 또는 MASTER 역할이면 true */
export function isAdminRole(session: WorkerSession | null): boolean {
  if (!session?.role) return false;
  return (ADMIN_ROLES as readonly string[]).includes(session.role.toUpperCase());
}

export function touchSession(): WorkerSession | null {
  const current = readSession();
  if (!current || isSessionExpired(current)) {
    clearSession();
    return null;
  }
  const next: WorkerSession = {
    ...current,
    lastActivityAt: Date.now(),
  };
  writeSession(next);
  return next;
}
