import { describe, expect, test, vi } from "vitest";
import { NextResponse } from "next/server";

/**
 * 시나리오 E3 — Idempotency body hash 비교 (payload_mismatch)
 *
 * 정책 (lib/idempotency.ts withIdempotency):
 *   - 같은 X-Idempotency-Key + 동일 body  → 캐시 hit, handler 1회 (기존 동작)
 *   - 같은 X-Idempotency-Key + 다른 body  → 409 `payload_mismatch` 반환 (E3 신규)
 *   - 다른 key                              → 각자 정상 실행
 *   - 본문 없는 두 요청은 빈 해시로 일치 (기존 동작 보존)
 */

describe("시나리오 E3 — Idempotency payload mismatch", () => {
  test("같은 key + 다른 body → 두 번째 요청 409 payload_mismatch", async () => {
    const { withIdempotency, _resetIdempotencyCache } = await import(
      "@/lib/idempotency"
    );
    _resetIdempotencyCache();

    const handler = vi.fn(async () =>
      NextResponse.json({ id: "rec-created", success: true }),
    );

    const req1 = new Request("http://x/api/test", {
      method: "POST",
      headers: {
        "X-Idempotency-Key": "key-E3-001",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ amount: 100, seller: "A" }),
    });
    const req2 = new Request("http://x/api/test", {
      method: "POST",
      headers: {
        "X-Idempotency-Key": "key-E3-001",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ amount: 200, seller: "B" }), // 다른 body
    });

    const res1 = await withIdempotency(req1, handler);
    const res2 = await withIdempotency(req2, handler);

    expect(handler).toHaveBeenCalledTimes(1); // 두 번째는 차단
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(409);

    const body2 = await res2.json();
    expect(body2.idempotency).toBe("payload_mismatch");
    expect(body2.error).toContain("다른 요청 페이로드");
  });

  test("같은 key + 같은 body → 캐시 hit (기존 동작 보존)", async () => {
    const { withIdempotency, _resetIdempotencyCache } = await import(
      "@/lib/idempotency"
    );
    _resetIdempotencyCache();

    const handler = vi.fn(async () =>
      NextResponse.json({ id: "rec-stable" }),
    );

    const makeReq = () =>
      new Request("http://x/api/test", {
        method: "POST",
        headers: {
          "X-Idempotency-Key": "key-E3-002",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amount: 100 }),
      });

    const res1 = await withIdempotency(makeReq(), handler);
    const res2 = await withIdempotency(makeReq(), handler);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    const body1 = await res1.json();
    const body2 = await res2.json();
    expect(body2).toEqual(body1);
  });

  test("같은 key + 다른 body 후 같은 body 재시도 → 여전히 mismatch 차단", async () => {
    // 첫 정상 요청이 캐시에 자리 잡은 후, 다른 body로 재시도하면 차단되어야 함.
    // 캐시는 첫 요청의 body hash를 5분간 보존하므로 첫 body로 재시도하면 다시 정상 캐시 hit.
    const { withIdempotency, _resetIdempotencyCache } = await import(
      "@/lib/idempotency"
    );
    _resetIdempotencyCache();

    const handler = vi.fn(async () => NextResponse.json({ ok: true }));

    const makeReq = (amount: number) =>
      new Request("http://x/api/test", {
        method: "POST",
        headers: {
          "X-Idempotency-Key": "key-E3-003",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amount }),
      });

    const r1 = await withIdempotency(makeReq(100), handler); // 정상
    const r2 = await withIdempotency(makeReq(999), handler); // mismatch
    const r3 = await withIdempotency(makeReq(100), handler); // 동일 body — 캐시 hit

    expect(handler).toHaveBeenCalledTimes(1);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(409);
    expect(r3.status).toBe(200);
    const b2 = await r2.json();
    expect(b2.idempotency).toBe("payload_mismatch");
  });

  test("본문 없는 요청 두 번 → 빈 해시 일치, 정상 캐시 hit", async () => {
    const { withIdempotency, _resetIdempotencyCache } = await import(
      "@/lib/idempotency"
    );
    _resetIdempotencyCache();

    const handler = vi.fn(async () => NextResponse.json({ ok: true }));

    const makeReq = () =>
      new Request("http://x/api/test", {
        method: "POST",
        headers: { "X-Idempotency-Key": "key-E3-004" },
      });

    const r1 = await withIdempotency(makeReq(), handler);
    const r2 = await withIdempotency(makeReq(), handler);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200); // mismatch 아님
  });

  test("다른 key + 다른 body → 각자 정상 실행", async () => {
    const { withIdempotency, _resetIdempotencyCache } = await import(
      "@/lib/idempotency"
    );
    _resetIdempotencyCache();

    let counter = 0;
    const handler = vi.fn(async () => {
      counter++;
      return NextResponse.json({ counter });
    });

    const req1 = new Request("http://x/api/test", {
      method: "POST",
      headers: {
        "X-Idempotency-Key": "key-E3-A",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ amount: 100 }),
    });
    const req2 = new Request("http://x/api/test", {
      method: "POST",
      headers: {
        "X-Idempotency-Key": "key-E3-B",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ amount: 200 }),
    });

    const r1 = await withIdempotency(req1, handler);
    const r2 = await withIdempotency(req2, handler);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(counter).toBe(2);
  });
});
