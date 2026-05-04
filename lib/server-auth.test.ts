import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// 테스트용 환경변수 — server-auth 모듈 import 전에 설정해야 getBaseCredentials() 통과
process.env.AIRTABLE_API_KEY = "test-pat";
process.env.AIRTABLE_BASE_ID = "appTEST";

import {
  AuthError,
  invalidateWorkerCache,
  requireAdmin,
  requireWorker,
} from "./server-auth";

const VALID_ID = "recVALID12345";
const ADMIN_ID = "recADMIN12345";
const MASTER_ID = "recMASTER1234";
const INACTIVE_ID = "recINACTIVE12";

type WorkerFields = {
  작업자명?: string;
  PIN?: string;
  활성?: boolean | number | string;
  권한?: string;
};

function airtableResponse(fields: WorkerFields, id = VALID_ID): Response {
  return new Response(JSON.stringify({ id, fields }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function notFoundResponse(): Response {
  return new Response(JSON.stringify({ error: { message: "Not found" } }), {
    status: 404,
    headers: { "content-type": "application/json" },
  });
}

function errorResponse(status: number): Response {
  return new Response("server error", { status });
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  invalidateWorkerCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  invalidateWorkerCache();
});

describe("requireWorker — 입력 검증", () => {
  test("workerId 누락 → NO_SESSION", async () => {
    await expect(requireWorker(undefined)).rejects.toBeInstanceOf(AuthError);
    await expect(requireWorker(undefined)).rejects.toMatchObject({ code: "NO_SESSION" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("빈 문자열 → NO_SESSION", async () => {
    await expect(requireWorker("")).rejects.toMatchObject({ code: "NO_SESSION" });
  });

  test("rec 접두사 없는 형식 → NO_SESSION", async () => {
    await expect(requireWorker("not-a-record-id")).rejects.toMatchObject({ code: "NO_SESSION" });
    await expect(requireWorker("ADMIN")).rejects.toMatchObject({ code: "NO_SESSION" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("앞뒤 공백은 trim 후 검증", async () => {
    fetchMock.mockResolvedValueOnce(airtableResponse({ 작업자명: "김", 활성: true, 권한: "WORKER" }));
    const w = await requireWorker(`  ${VALID_ID}  `);
    expect(w.id).toBe(VALID_ID);
  });
});

describe("requireWorker — Airtable 응답 처리", () => {
  test("404 → INVALID_WORKER", async () => {
    fetchMock.mockResolvedValueOnce(notFoundResponse());
    await expect(requireWorker(VALID_ID)).rejects.toMatchObject({ code: "INVALID_WORKER" });
  });

  test("500 → INVALID_WORKER", async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(500));
    await expect(requireWorker(VALID_ID)).rejects.toMatchObject({ code: "INVALID_WORKER" });
  });

  test("활성 false → INACTIVE", async () => {
    fetchMock.mockResolvedValueOnce(
      airtableResponse({ 작업자명: "김", 활성: false, 권한: "WORKER" }, INACTIVE_ID),
    );
    await expect(requireWorker(INACTIVE_ID)).rejects.toMatchObject({ code: "INACTIVE" });
  });

  test('활성 "true" 문자열 → 통과', async () => {
    fetchMock.mockResolvedValueOnce(
      airtableResponse({ 작업자명: "김", 활성: "true", 권한: "WORKER" }),
    );
    const w = await requireWorker(VALID_ID);
    expect(w.role).toBe("WORKER");
  });

  test("활성 1 → 통과", async () => {
    fetchMock.mockResolvedValueOnce(
      airtableResponse({ 작업자명: "김", 활성: 1, 권한: "WORKER" }),
    );
    const w = await requireWorker(VALID_ID);
    expect(w.role).toBe("WORKER");
  });
});

describe("requireWorker — role 파싱", () => {
  test("ADMIN 정상", async () => {
    fetchMock.mockResolvedValueOnce(
      airtableResponse({ 작업자명: "관리", 활성: true, 권한: "ADMIN" }, ADMIN_ID),
    );
    const w = await requireWorker(ADMIN_ID);
    expect(w.role).toBe("ADMIN");
    expect(w.name).toBe("관리");
  });

  test("MASTER 정상", async () => {
    fetchMock.mockResolvedValueOnce(
      airtableResponse({ 작업자명: "마스터", 활성: true, 권한: "MASTER" }, MASTER_ID),
    );
    const w = await requireWorker(MASTER_ID);
    expect(w.role).toBe("MASTER");
  });

  test("소문자 admin → 대문자 정규화", async () => {
    fetchMock.mockResolvedValueOnce(
      airtableResponse({ 작업자명: "관리", 활성: true, 권한: "admin" }, ADMIN_ID),
    );
    const w = await requireWorker(ADMIN_ID);
    expect(w.role).toBe("ADMIN");
  });

  test("알 수 없는 role → WORKER 기본값", async () => {
    fetchMock.mockResolvedValueOnce(
      airtableResponse({ 작업자명: "김", 활성: true, 권한: "GUEST" }),
    );
    const w = await requireWorker(VALID_ID);
    expect(w.role).toBe("WORKER");
  });

  test("권한 필드 누락 → WORKER 기본값", async () => {
    fetchMock.mockResolvedValueOnce(airtableResponse({ 작업자명: "김", 활성: true }));
    const w = await requireWorker(VALID_ID);
    expect(w.role).toBe("WORKER");
  });

  test("이름 누락 → (no name)", async () => {
    fetchMock.mockResolvedValueOnce(airtableResponse({ 활성: true, 권한: "WORKER" }));
    const w = await requireWorker(VALID_ID);
    expect(w.name).toBe("(no name)");
  });
});

describe("requireWorker — 캐시", () => {
  test("30초 이내 두 번째 호출은 fetch 안 함", async () => {
    fetchMock.mockResolvedValueOnce(
      airtableResponse({ 작업자명: "김", 활성: true, 권한: "WORKER" }),
    );
    await requireWorker(VALID_ID);
    await requireWorker(VALID_ID);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("invalidateWorkerCache 후 다시 fetch 호출", async () => {
    fetchMock
      .mockResolvedValueOnce(airtableResponse({ 작업자명: "김", 활성: true, 권한: "WORKER" }))
      .mockResolvedValueOnce(airtableResponse({ 작업자명: "김", 활성: true, 권한: "ADMIN" }));
    const w1 = await requireWorker(VALID_ID);
    expect(w1.role).toBe("WORKER");

    invalidateWorkerCache(VALID_ID);
    const w2 = await requireWorker(VALID_ID);
    expect(w2.role).toBe("ADMIN"); // 새로 조회된 값
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("다른 workerId는 별도 fetch", async () => {
    const otherId = "recOTHER12345";
    fetchMock
      .mockResolvedValueOnce(airtableResponse({ 작업자명: "김", 활성: true, 권한: "WORKER" }, VALID_ID))
      .mockResolvedValueOnce(airtableResponse({ 작업자명: "이", 활성: true, 권한: "ADMIN" }, otherId));
    await requireWorker(VALID_ID);
    await requireWorker(otherId);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("requireAdmin", () => {
  test("WORKER → FORBIDDEN", async () => {
    fetchMock.mockResolvedValueOnce(
      airtableResponse({ 작업자명: "김", 활성: true, 권한: "WORKER" }),
    );
    await expect(requireAdmin(VALID_ID)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("ADMIN → 통과", async () => {
    fetchMock.mockResolvedValueOnce(
      airtableResponse({ 작업자명: "관리", 활성: true, 권한: "ADMIN" }, ADMIN_ID),
    );
    const w = await requireAdmin(ADMIN_ID);
    expect(w.role).toBe("ADMIN");
  });

  test("MASTER → 통과", async () => {
    fetchMock.mockResolvedValueOnce(
      airtableResponse({ 작업자명: "마스터", 활성: true, 권한: "MASTER" }, MASTER_ID),
    );
    const w = await requireAdmin(MASTER_ID);
    expect(w.role).toBe("MASTER");
  });

  test("비활성 ADMIN → INACTIVE (FORBIDDEN보다 우선)", async () => {
    fetchMock.mockResolvedValueOnce(
      airtableResponse({ 작업자명: "관리", 활성: false, 권한: "ADMIN" }, ADMIN_ID),
    );
    await expect(requireAdmin(ADMIN_ID)).rejects.toMatchObject({ code: "INACTIVE" });
  });

  test("workerId 미입력 → NO_SESSION (Airtable 호출 안 함)", async () => {
    await expect(requireAdmin(undefined)).rejects.toMatchObject({ code: "NO_SESSION" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
