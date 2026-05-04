import "server-only";
// ─────────────────────────────────────────────────────────────────────────────
// 서버 액션 권한 검증
// 클라이언트가 보낸 workerId를 Airtable에서 직접 조회해 활성 여부와 권한을
// 매 요청마다 확인합니다. localStorage의 role 값을 절대 신뢰하지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

import { getBaseCredentials, getWorkersTablePath } from "@/lib/airtable";
import { WORKER_FIELDS } from "@/lib/airtable-schema";

export type WorkerRole = "WORKER" | "ADMIN" | "MASTER";

export type VerifiedWorker = {
  id: string;
  name: string;
  role: WorkerRole;
};

export class AuthError extends Error {
  readonly code: "NO_SESSION" | "INVALID_WORKER" | "INACTIVE" | "FORBIDDEN";
  constructor(
    code: "NO_SESSION" | "INVALID_WORKER" | "INACTIVE" | "FORBIDDEN",
    message: string,
  ) {
    super(message);
    this.code = code;
    this.name = "AuthError";
  }
}

const ROLE_VALUES: readonly WorkerRole[] = ["WORKER", "ADMIN", "MASTER"];
const ADMIN_ROLES: readonly WorkerRole[] = ["ADMIN", "MASTER"];
const RECORD_ID_RE = /^rec[a-zA-Z0-9]+$/;

/**
 * 동일 사용자의 액션이 짧은 시간에 여러 번 들어올 때 Airtable 호출을
 * 줄이기 위한 인-메모리 캐시. 작업자 비활성·권한 변경 반영이 30초 내에
 * 이루어지므로 운영상 충분합니다.
 */
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { worker: VerifiedWorker; expiresAt: number }>();

function isActive(value: unknown): boolean {
  return (
    value === 1 ||
    value === true ||
    value === "1" ||
    String(value).toLowerCase() === "true"
  );
}

/**
 * 클라이언트가 보낸 workerId를 Airtable에서 다시 조회해 활성 작업자임을 확인하고
 * 서버측에서 검증된 (id, name, role)을 반환합니다.
 *
 * @throws {AuthError} 형식 오류 / 미존재 / 비활성 시
 */
export async function requireWorker(
  workerId: string | null | undefined,
): Promise<VerifiedWorker> {
  const id = (workerId ?? "").trim();
  if (!id || !RECORD_ID_RE.test(id)) {
    throw new AuthError("NO_SESSION", "로그인 정보를 확인해주세요.");
  }

  const now = Date.now();
  const cached = cache.get(id);
  if (cached && cached.expiresAt > now) {
    return cached.worker;
  }

  let token: string;
  let baseId: string;
  try {
    ({ token, baseId } = getBaseCredentials());
  } catch {
    throw new AuthError("INVALID_WORKER", "서버 환경 설정 오류");
  }

  const path = getWorkersTablePath();
  const url = `https://api.airtable.com/v0/${baseId}/${path}/${id}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 0 },
  });

  if (res.status === 404) {
    throw new AuthError("INVALID_WORKER", "작업자 정보를 찾을 수 없습니다.");
  }
  if (!res.ok) {
    throw new AuthError(
      "INVALID_WORKER",
      `작업자 검증 실패 (HTTP ${res.status})`,
    );
  }

  const data = (await res.json()) as {
    id?: string;
    fields?: Record<string, unknown>;
  };
  const fields = data.fields ?? {};

  if (!isActive(fields[WORKER_FIELDS.active])) {
    throw new AuthError("INACTIVE", "비활성화된 작업자입니다.");
  }

  const name =
    String(fields[WORKER_FIELDS.name] ?? "").trim() || "(no name)";
  const rawRole = String(fields[WORKER_FIELDS.role] ?? "WORKER")
    .trim()
    .toUpperCase();
  const role: WorkerRole = (ROLE_VALUES as readonly string[]).includes(rawRole)
    ? (rawRole as WorkerRole)
    : "WORKER";

  const worker: VerifiedWorker = { id: data.id ?? id, name, role };
  cache.set(id, { worker, expiresAt: now + CACHE_TTL_MS });
  return worker;
}

/**
 * requireWorker + 관리자 권한(ADMIN/MASTER) 확인.
 *
 * @throws {AuthError} 권한 부족 시 FORBIDDEN
 */
export async function requireAdmin(
  workerId: string | null | undefined,
): Promise<VerifiedWorker> {
  const worker = await requireWorker(workerId);
  if (!ADMIN_ROLES.includes(worker.role)) {
    throw new AuthError("FORBIDDEN", "관리자 권한이 필요합니다.");
  }
  return worker;
}

/**
 * 캐시된 작업자 정보를 명시적으로 무효화합니다.
 * 권한 변경·비활성화가 즉시 반영되어야 할 때 사용.
 */
export function invalidateWorkerCache(workerId?: string): void {
  if (workerId) cache.delete(workerId);
  else cache.clear();
}
