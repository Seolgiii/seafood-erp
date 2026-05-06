import "server-only";
// ─────────────────────────────────────────────────────────────────────────────
// Airtable 통신 기반 유틸리티
// 이 파일은 시스템 전체에서 Airtable(온라인 데이터베이스)과 통신하는
// 공통 함수들을 모아둔 곳입니다.
// 서버에서만 실행 가능하며, API 키 등 민감한 정보를 안전하게 처리합니다.
// ─────────────────────────────────────────────────────────────────────────────
import { AIRTABLE_TABLE, WORKER_FIELDS } from "@/lib/airtable-schema";
import { hashPin, isHashedPin, verifyHashedPin } from "@/lib/pin-hash";
import { log, logWarn } from "@/lib/logger";
import { WorkerFieldsSchema, reportSchemaIssue } from "@/lib/schemas";

const PIN_HASH_FIELD = "pin_hash";

// Airtable REST API 기본 URL
const API = "https://api.airtable.com/v0";

/**
 * 환경변수에서 읽어온 값에 감싸진 따옴표를 제거합니다.
 * .env 파일에 실수로 "값" 또는 '값'처럼 저장된 경우를 자동 처리합니다.
 * 예: '"my-base-id"' → 'my-base-id'
 */
function stripWrappingQuotes(raw: string): string {
  let s = raw.trim();
  for (let i = 0; i < 2 && s.length >= 2; i++) {
    const a = s[0];
    const b = s[s.length - 1];
    if ((a === `"` && b === `"`) || (a === `'` && b === `'`)) {
      s = s.slice(1, -1).trim();
      continue;
    }
    break;
  }
  return s;
}

/**
 * 테이블 이름을 Airtable API URL에 사용할 수 있는 형태로 변환합니다.
 * - tbl…로 시작하는 테이블 ID는 그대로 사용
 * - 한글 테이블명은 URL 인코딩 처리 (예: "입고 관리" → "%EC%9E%85%EA%B3%A0%20%EA%B4%80%EB%A6%AC")
 */
export function tablePathSegment(raw: string): string {
  const t = stripWrappingQuotes(raw);
  if (/^tbl[0-9a-zA-Z]+$/i.test(t)) return t;
  return encodeURIComponent(t);
}

/**
 * Airtable 쓰기 오류 발생 시 사용자가 이해할 수 있는 힌트 메시지를 반환합니다.
 * 422 오류는 보통 Single Select 필드에 정의되지 않은 옵션값을 넣으려 할 때 발생합니다.
 */
function airtableWriteErrorHint(status: number, bodyText: string): string {
  if (status === 422) {
    const t = bodyText.toLowerCase();
    if (
      t.includes("select option") ||
      t.includes("insufficient permissions to create")
    ) {
      return (
        " (422: '상태' 등 Single select 필드에 보낸 값이 Airtable에 정의된 옵션과 정확히 일치하지 않아, 새 옵션 생성을 시도했을 수 있습니다. " +
        "베이스에서 해당 옵션을 미리 추가하거나 .env의 AIRTABLE_TXN_STATUS_PENDING / APPROVED / INBOUND 값을 기존 옵션 텍스트와 동일하게 맞추세요. " +
        "JSON 본문에서는 문자열만 전달합니다 — 따옴표를 값 안에 넣지 마세요.)"
      );
    }
  }
  return "";
}

/**
 * Airtable 조회 오류 발생 시 사용자가 이해할 수 있는 힌트 메시지를 반환합니다.
 * 403 오류는 API 토큰의 권한이 부족하거나 접근 가능한 베이스 목록에 해당 베이스가 없을 때 발생합니다.
 */
function airtableErrorHint(status: number): string {
  if (status === 403) {
    return (
      " (403: PAT에 이 베이스 접근 권한이 없거나, scope에 data.records:read 가 빠졌을 수 있습니다. " +
      "https://airtable.com/create/tokens 에서 토큰을 다시 만들고 해당 베이스를 추가했는지, " +
      "AIRTABLE_BASE_ID가 그 베이스의 ID(app…)와 같은지 확인하세요.)"
    );
  }
  return "";
}

/**
 * 환경변수에서 Airtable 인증 정보를 읽어옵니다.
 * AIRTABLE_API_KEY와 AIRTABLE_BASE_ID가 반드시 설정되어 있어야 합니다.
 * 없으면 즉시 에러를 발생시킵니다.
 */
export function getBaseCredentials() {
  const rawKey = process.env.AIRTABLE_API_KEY;
  const rawBase = process.env.AIRTABLE_BASE_ID;
  const token = stripWrappingQuotes(rawKey ?? "");
  const baseId = stripWrappingQuotes(rawBase ?? "");

  console.log("[airtable] getBaseCredentials debug:", {
    AIRTABLE_API_KEY_set: !!rawKey,
    AIRTABLE_BASE_ID_set: !!rawBase,
    token_prefix: token.slice(0, 10) || "(empty)",
    token_length: token.length,
    baseId_prefix: baseId.slice(0, 6) || "(empty)",
  });

  if (!token || !baseId) {
    throw new Error("Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID");
  }
  return { token, baseId };
}

/** 로그인·신청자 해석 등과 동일한 작업자 테이블 경로 (한글명 또는 tbl… / env) */
export function getWorkersTablePath(): string {
  return tablePathSegment(
    process.env.AIRTABLE_WORKERS_TABLE?.trim() ?? AIRTABLE_TABLE.workers
  );
}

/** 품목 마스터 테이블 경로 — 스키마 기본은 "품목마스터" (공백 없음) */
export function getProductsTablePath(): string {
  return tablePathSegment(
    process.env.AIRTABLE_PRODUCTS_TABLE?.trim() ?? AIRTABLE_TABLE.products
  );
}

/** 내부 전용: 작업자 테이블 경로를 간단히 가져오는 래퍼 */
function workersTable(): string {
  return getWorkersTablePath();
}

/** Airtable 레코드의 기본 구조 타입 */
type AirtableRecord<T> = { id: string; fields: T };

/**
 * Airtable의 숫자형 PIN을 4자리 문자열로 정규화합니다.
 * 저장 방식에 따라 숫자·문자열이 섞여 올 수 있어 통일 처리합니다.
 * 예: 42 → "0042", "123456" → "3456" (끝 4자리)
 */
function normalizePin4(raw: unknown): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 4) return digits;
  if (digits.length < 4) return digits.padStart(4, "0");
  // If Airtable number formatting adds noise, compare on last 4 digits.
  return digits.slice(-4);
}

/**
 * Airtable API에 GET/POST/PATCH 요청을 보내는 공통 함수입니다.
 * 인증 헤더(Authorization)를 자동으로 추가하고, 오류 시 예외를 발생시킵니다.
 *
 * @param path - 테이블명/레코드ID 등 API 엔드포인트의 상대 경로
 * @param init - fetch의 옵션 (method, body 등)
 */
export async function fetchAirtable(path: string, init?: RequestInit) {
  const { token, baseId } = getBaseCredentials();
  const res = await fetch(`${API}/${baseId}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    next: { revalidate: 0 }, // 항상 최신 데이터 사용 (캐시 비활성화)
  });

  if (!res.ok) {
    const text = await res.text();
    const hint = airtableErrorHint(res.status);
    throw new Error(
      `Airtable error ${res.status} [${baseId}/${path}]: ${text}${hint}`
    );
  }

  return res.json();
}

/**
 * Airtable 테이블에 새 레코드(행)를 추가합니다.
 * 성공하면 생성된 레코드의 ID를 반환합니다.
 *
 * @param tablePath - 테이블 경로 (URL 인코딩 처리된 한글명 또는 tbl… ID)
 * @param fields - 저장할 필드값 객체
 */
export async function createAirtableRecord(
  tablePath: string,
  fields: Record<string, unknown>
): Promise<{ id: string }> {
  const { token, baseId } = getBaseCredentials();
  console.log("[Airtable][CREATE] target=", {
    baseId,
    tablePath,
    fields,
  });
  const res = await fetch(`${API}/${baseId}/${tablePath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Airtable error ${res.status} [${baseId}/${tablePath}]: ${text}${airtableErrorHint(res.status)}${airtableWriteErrorHint(res.status, text)}`
    );
  }
  const data: { id?: string } = await res.json();
  if (!data.id) throw new Error("Airtable create: missing id");
  return { id: data.id };
}

/**
 * Airtable 레코드의 특정 필드값을 수정합니다.
 * 전체 레코드를 다시 쓰지 않고 변경된 필드만 업데이트합니다(PATCH 방식).
 *
 * @param tablePath - 테이블 경로
 * @param recordId - 수정할 레코드의 ID
 * @param fields - 변경할 필드와 새 값의 객체
 */
export async function patchAirtableRecord(
  tablePath: string,
  recordId: string,
  fields: Record<string, unknown>
): Promise<void> {
  const { token, baseId } = getBaseCredentials();
  console.log("[Airtable][PATCH] target=", {
    baseId,
    tablePath,
    recordId,
    fields,
  });
  const res = await fetch(`${API}/${baseId}/${tablePath}/${recordId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Airtable error ${res.status} [${baseId}/${tablePath}/${recordId}]: ${text}${airtableErrorHint(res.status)}${airtableWriteErrorHint(res.status, text)}`
    );
  }
}

/**
 * Airtable에서 단일 레코드를 조회하여 ID와 필드값을 반환합니다.
 *
 * @param tablePath - 테이블 경로
 * @param recordId - 조회할 레코드의 ID
 */
export async function getAirtableRecord(
  tablePath: string,
  recordId: string
): Promise<{ id: string; fields: Record<string, unknown> }> {
  const data = await fetchAirtable(`${tablePath}/${recordId}`);
  return {
    id: data.id as string,
    fields: (data.fields ?? {}) as Record<string, unknown>,
  };
}

/** 작업자 요약 정보 타입 (로그인 화면 목록 표시용) */
export type WorkerSummary = { id: string; name: string };

/**
 * 활성화된 작업자 목록을 반환합니다.
 * Airtable의 작업자 테이블에서 '활성' 체크박스가 켜진 직원만 조회합니다.
 * 로그인 화면에서 이름 선택 드롭다운에 표시할 목록을 불러올 때 사용합니다.
 */
export async function listActiveWorkers(): Promise<WorkerSummary[]> {
  const table = workersTable();
  const nameField = WORKER_FIELDS.name;
  const activeField = WORKER_FIELDS.active;

  // 활성 체크박스가 켜진 작업자만 필터링 (숫자 1 또는 TRUE 모두 허용)
  const filter = encodeURIComponent(
    `OR({${activeField}}=1, {${activeField}}=TRUE())`
  );
  const fields = encodeURIComponent(nameField); // 이름 필드만 가져와 불필요한 데이터 최소화
  const path = `${table}?filterByFormula=${filter}&fields[]=${fields}`;

  const data = await fetchAirtable(path);
  const records: AirtableRecord<Record<string, unknown>>[] = data.records ?? [];

  return records.map((r) => ({
    id: r.id,
    name: String(r.fields[nameField] ?? "").trim() || "(no name)",
  }));
}

/**
 * 직원이 입력한 PIN 번호를 검증하여 로그인 처리합니다.
 * PIN이 일치하고 활성화된 직원이면 이름과 역할(role)을 반환합니다.
 * 비활성화된 직원이거나 PIN이 틀리면 null을 반환합니다.
 *
 * @param recordId - 선택된 작업자의 레코드 ID
 * @param pin - 직원이 입력한 4자리 PIN 번호
 * @returns 로그인 성공 시 { id, name, role }, 실패 시 null
 */
export async function verifyWorkerPin(
  recordId: string,
  pin: string
): Promise<{ id: string; name: string; role: string } | null> {
  const table = workersTable();
  const path = `${table}/${recordId}`;
  const data: AirtableRecord<Record<string, unknown>> = await fetchAirtable(
    path
  );

  const fields = data.fields;

  // zod 검증 (모니터링 모드 — 실패해도 기존 흐름 그대로 진행)
  const parsed = WorkerFieldsSchema.safeParse(fields);
  if (!parsed.success) {
    reportSchemaIssue("verifyWorkerPin", recordId, parsed.error);
  }

  // 활성화 여부 확인 (비활성화된 직원은 로그인 불가)
  const active = fields[WORKER_FIELDS.active];
  const activeOk =
    active === 1 ||
    active === true ||
    active === "1" ||
    String(active).toLowerCase() === "true";
  if (!activeOk) {
    return null; // 비활성화된 직원
  }

  // PIN 검증: 해시 우선, 평문 fallback (자동 점진 마이그레이션)
  const normalizedPin = normalizePin4(pin);
  const storedHashRaw = String(fields[PIN_HASH_FIELD] ?? "").trim();
  let matched = false;

  if (storedHashRaw && isHashedPin(storedHashRaw)) {
    // 해시 검증 (timing-safe)
    matched = await verifyHashedPin(normalizedPin, storedHashRaw);
  } else {
    // legacy 평문 검증 + 일치 시 자동 해시 마이그레이션
    const storedPlain = normalizePin4(fields[WORKER_FIELDS.pin]);
    if (storedPlain && storedPlain === normalizedPin) {
      matched = true;
      // 비동기 백그라운드 마이그레이션 — 응답을 막지 않음
      void hashPin(normalizedPin)
        .then((newHash) =>
          patchAirtableRecord(table, recordId, { [PIN_HASH_FIELD]: newHash }),
        )
        .then(() => {
          log("[verifyWorkerPin] PIN 자동 해시화 완료:", recordId);
        })
        .catch((e) => {
          logWarn("[verifyWorkerPin] PIN 자동 해시화 실패:", recordId, e);
        });
    }
  }

  if (!matched) return null;

  // 역할(role) 확인: ADMIN, MASTER, WORKER 세 가지 중 하나 (알 수 없으면 기본값 WORKER)
  const name = String(fields[WORKER_FIELDS.name] ?? "").trim();
  const rawRole = String(fields[WORKER_FIELDS.role] ?? "WORKER").trim().toUpperCase();
  const VALID_ROLES = ["ADMIN", "MASTER", "WORKER"];
  const role = VALID_ROLES.includes(rawRole) ? rawRole : "WORKER";
  return { id: data.id, name: name || "(no name)", role };
}
