import { vi } from "vitest";
import { store, type Tables } from "./airtable-store";

/**
 * Airtable REST API 모킹 — global fetch 가로채기.
 *
 * URL 패턴:
 *   https://api.airtable.com/v0/{baseId}/{table}             — 목록 조회 / 신규 POST
 *   https://api.airtable.com/v0/{baseId}/{table}/{recordId}  — 단일 GET / PATCH / DELETE
 *
 * filterByFormula는 무시하고 전체 records 반환합니다 — 테스트마다 store에
 * 필요한 데이터만 seed해 정확성을 확보하는 패턴.
 *
 * fault injection (E1/E4 등 PATCH 실패 시나리오 검증용):
 *   injectFault({ table, method, fieldKey })로 다음 매칭 호출 1건을 500 응답
 *   처리합니다. afterEach에서 clearFaults()로 초기화하세요.
 */

const AIRTABLE_BASE_RE = /^https:\/\/api\.airtable\.com\/v0\/[^/]+\/(.+?)(?:\?|$)/;

export type FetchFault = {
  table: Tables | string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  recordId?: string;
  /** PATCH 시 body.fields에 이 키가 있으면 매칭 (예: "출고시점 판매원가") */
  fieldKey?: string;
  status?: number;
  /** 적용 횟수 (기본 1) */
  count?: number;
};

let activeFaults: FetchFault[] = [];

export function injectFault(fault: FetchFault): void {
  activeFaults.push({ ...fault, count: fault.count ?? 1 });
}

export function clearFaults(): void {
  activeFaults = [];
}

function pickFault(
  table: string,
  method: string,
  recordId: string | null,
  body: { fields?: Record<string, unknown> },
): FetchFault | null {
  for (let i = 0; i < activeFaults.length; i++) {
    const f = activeFaults[i];
    if (f.table !== table) continue;
    if (f.method !== method) continue;
    if (f.recordId && f.recordId !== recordId) continue;
    if (f.fieldKey && !(body.fields && f.fieldKey in body.fields)) continue;
    // 소진 처리
    f.count = (f.count ?? 1) - 1;
    if ((f.count ?? 0) <= 0) activeFaults.splice(i, 1);
    return f;
  }
  return null;
}

/**
 * 운영 Airtable formula 필드 시뮬레이션.
 *
 * in-memory store는 formula를 계산하지 않으므로, 실제 Airtable과 동일한 동작을
 * 위해 POST/PATCH 직후 formula 결과 필드를 직접 채워준다.
 *
 *  - 출고 관리.판매금액 = 판매가 × 출고수량 (operational formula 필드)
 */
function applyFormulas(table: string, recordId: string): void {
  if (table !== "출고 관리") return;
  const rec = store.get(table, recordId);
  if (!rec) return;
  const salePrice = Number(rec.fields["판매가"]);
  const qty = Number(rec.fields["출고수량"]);
  const saleAmount =
    Number.isFinite(salePrice) && Number.isFinite(qty) ? salePrice * qty : 0;
  store.patch(table, recordId, { 판매금액: saleAmount });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function readBody(init?: RequestInit): Promise<{ fields?: Record<string, unknown> }> {
  if (!init?.body) return {};
  if (typeof init.body === "string") {
    try {
      return JSON.parse(init.body) as { fields?: Record<string, unknown> };
    } catch {
      return {};
    }
  }
  return {};
}

type FetchInput = string | URL | Request;

/** 단순 패턴 `{필드명}="값"` 매칭 — 자주 쓰이는 LOT번호·품목명 검색 등 */
function parseSimpleEqFilter(
  formula: string,
): { field: string; value: string } | null {
  const m = /\{([^}]+)\}\s*=\s*["']([^"']+)["']/.exec(formula);
  return m ? { field: m[1], value: m[2] } : null;
}

async function airtableHandler(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const u = new URL(url);
  const match = AIRTABLE_BASE_RE.exec(url);
  if (!match) return jsonResponse(404, { error: "Unknown URL" });
  const pathRest = match[1].split("?")[0];
  const segments = pathRest.split("/").filter(Boolean).map(decodeURIComponent);
  const table = segments[0] as Tables;
  const recordId = segments[1] ?? null;

  const method = (init?.method ?? "GET").toUpperCase();
  const body = await readBody(init);

  // fault injection — 매칭되면 store 변경 없이 에러 응답
  const fault = pickFault(table, method, recordId, body);
  if (fault) {
    return jsonResponse(fault.status ?? 500, {
      error: { type: "INJECTED_FAULT", table, method, recordId, fieldKey: fault.fieldKey },
    });
  }

  // GET single
  if (method === "GET" && recordId) {
    const rec = store.get(table, recordId);
    if (!rec) return jsonResponse(404, { error: { type: "NOT_FOUND" } });
    return jsonResponse(200, rec);
  }

  // GET list — 단순 `{필드}="값"` filter 지원, 그 외엔 전체 반환
  if (method === "GET" && !recordId) {
    const formula = u.searchParams.get("filterByFormula") ?? "";
    const eq = parseSimpleEqFilter(formula);
    if (eq) {
      const matched = store
        .list(table)
        .filter((r) => String(r.fields[eq.field] ?? "") === eq.value);
      return jsonResponse(200, { records: matched });
    }
    return jsonResponse(200, { records: store.list(table) });
  }

  // POST create
  if (method === "POST" && !recordId) {
    if (!body.fields) return jsonResponse(422, { error: "fields missing" });
    const rec = store.create(table, body.fields);
    applyFormulas(table, rec.id);
    return jsonResponse(200, store.get(table, rec.id) ?? rec);
  }

  // PATCH update
  if (method === "PATCH" && recordId) {
    if (!body.fields) return jsonResponse(422, { error: "fields missing" });
    const rec = store.patch(table, recordId, body.fields);
    if (!rec) return jsonResponse(404, { error: { type: "NOT_FOUND" } });
    applyFormulas(table, recordId);
    return jsonResponse(200, store.get(table, recordId) ?? rec);
  }

  return jsonResponse(400, { error: "Unsupported" });
}

let installed = false;

export function installFetchMock(): void {
  if (installed) return;
  installed = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: FetchInput, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      // Airtable API
      if (url.startsWith("https://api.airtable.com/v0/")) {
        return airtableHandler(url, init);
      }

      // Resend API
      if (url.startsWith("https://api.resend.com/")) {
        return jsonResponse(200, { id: "mock-email-id" });
      }

      // 알 수 없는 외부 호출은 명시적으로 fail
      throw new Error(`[fetch-mock] Unhandled URL: ${url}`);
    }),
  );
}

export function uninstallFetchMock(): void {
  if (!installed) return;
  vi.unstubAllGlobals();
  installed = false;
}
