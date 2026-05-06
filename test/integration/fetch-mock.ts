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
 */

const AIRTABLE_BASE_RE = /^https:\/\/api\.airtable\.com\/v0\/[^/]+\/(.+?)(?:\?|$)/;

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
    return jsonResponse(200, rec);
  }

  // PATCH update
  if (method === "PATCH" && recordId) {
    if (!body.fields) return jsonResponse(422, { error: "fields missing" });
    const rec = store.patch(table, recordId, body.fields);
    if (!rec) return jsonResponse(404, { error: { type: "NOT_FOUND" } });
    return jsonResponse(200, rec);
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
