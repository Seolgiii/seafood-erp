import { afterEach, beforeAll, beforeEach, vi } from "vitest";
import { store } from "./airtable-store";
import { clearFaults, installFetchMock, uninstallFetchMock } from "./fetch-mock";

/**
 * 통합 테스트 공용 setup
 *
 *  - 모든 테스트 전에 필수 환경변수 stub
 *  - global fetch를 Airtable in-memory store로 모킹
 *  - 외부 의존성(Resend, Vercel Blob, PDF 생성, server-auth 캐시) 안전 처리
 *  - 각 테스트 후 store 초기화로 격리
 */

// ── 환경변수 ──
// vitest가 NODE_ENV를 자동으로 "test"로 설정하므로 별도 할당 불필요
process.env.AIRTABLE_API_KEY = "mock-pat";
process.env.AIRTABLE_BASE_ID = "appMOCKBASE";

// ── 외부 의존성 mock ──

// Vercel Blob: 실제 업로드 없이 mock URL 반환
vi.mock("@vercel/blob", () => ({
  put: vi.fn(async (path: string) => ({
    url: `https://mock-blob.vercel-storage.com/${path}`,
    pathname: path,
  })),
}));

// PDF 생성: Buffer만 반환 (renderToBuffer는 무거우므로 단순 stub)
vi.mock("@/lib/generate-pdf.server", () => ({
  generateInboundPdf: vi.fn(async () => Buffer.from("mock-pdf")),
  generateOutboundPdf: vi.fn(async () => Buffer.from("mock-pdf")),
  generateExpensePdf: vi.fn(async () => Buffer.from("mock-pdf")),
}));

// Resend
vi.mock("@/lib/resend", () => ({
  sendEmail: vi.fn(async () => ({ ok: true, id: "mock-email-id" })),
}));

// next/cache의 revalidatePath는 노드에서 의미 없음 — no-op
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

// next/server의 cookies/headers는 server action 컨텍스트 외부에선 동작 X
// 다행히 우리 server-auth는 workerId를 인자로 받아 동작하므로 영향 없음

// ── fetch 모킹 설치 ──
beforeAll(() => {
  installFetchMock();
});

// ── 각 테스트마다 store 초기화 ──
beforeEach(async () => {
  store.reset();
  // server-auth 캐시도 초기화 (요청 간 누수 방지)
  const { invalidateWorkerCache } = await import("@/lib/server-auth");
  invalidateWorkerCache();
});

afterEach(() => {
  vi.clearAllMocks();
  clearFaults();
});
