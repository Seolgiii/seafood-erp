import { describe, expect, test, vi } from "vitest";
import { NextResponse } from "next/server";
import { store } from "./airtable-store";
import {
  ALL_MASTERS,
  PRODUCT_MACKEREL,
  STORAGE_HANRIM,
  WORKER_ADMIN,
  WORKER_NORMAL,
  makeApprovedInboundRecord,
  makeInStockLot,
} from "./fixtures";

/**
 * 시나리오 19 — Idempotency 중복 제출 방어 (X-Idempotency-Key)
 * 시나리오 20 — 양방향 변경 멱등성 (승인↔반려 토글, 시나리오 6 보강)
 * 시나리오 21 — PDF 생성 실패해도 승인 성공 (격리)
 */

describe("시나리오 19 — Idempotency 중복 제출 방어", () => {
  test("같은 X-Idempotency-Key 두 번 → handler는 1회만 실행, 응답 동일", async () => {
    const { withIdempotency, _resetIdempotencyCache } = await import(
      "@/lib/idempotency"
    );
    _resetIdempotencyCache();

    const handler = vi.fn(async () =>
      NextResponse.json({ id: "rec-created", success: true }),
    );

    const req1 = new Request("http://x/api/test", {
      method: "POST",
      headers: { "X-Idempotency-Key": "test-key-001" },
      body: JSON.stringify({ amount: 100 }),
    });
    const req2 = new Request("http://x/api/test", {
      method: "POST",
      headers: { "X-Idempotency-Key": "test-key-001" },
      body: JSON.stringify({ amount: 100 }),
    });

    const res1 = await withIdempotency(req1, handler);
    const res2 = await withIdempotency(req2, handler);

    expect(handler).toHaveBeenCalledTimes(1); // 두 번째는 캐시
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    const body1 = await res1.json();
    const body2 = await res2.json();
    expect(body2).toEqual(body1);
  });

  test("다른 key → handler 2회 실행", async () => {
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
      headers: { "X-Idempotency-Key": "key-A" },
    });
    const req2 = new Request("http://x/api/test", {
      method: "POST",
      headers: { "X-Idempotency-Key": "key-B" },
    });

    await withIdempotency(req1, handler);
    await withIdempotency(req2, handler);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(counter).toBe(2);
  });

  test("헤더 없음 → backward compatible (handler 매번 실행)", async () => {
    const { withIdempotency, _resetIdempotencyCache } = await import(
      "@/lib/idempotency"
    );
    _resetIdempotencyCache();

    const handler = vi.fn(async () => NextResponse.json({ ok: true }));

    const reqNoKey = new Request("http://x/api/test", { method: "POST" });
    await withIdempotency(reqNoKey, handler);
    await withIdempotency(reqNoKey, handler);

    expect(handler).toHaveBeenCalledTimes(2);
  });

  test("형식 부적합 key (너무 짧음) → backward compatible", async () => {
    const { withIdempotency, _resetIdempotencyCache } = await import(
      "@/lib/idempotency"
    );
    _resetIdempotencyCache();

    const handler = vi.fn(async () => NextResponse.json({ ok: true }));

    const reqBadKey = new Request("http://x/api/test", {
      method: "POST",
      headers: { "X-Idempotency-Key": "abc" }, // 8자 미만
    });
    await withIdempotency(reqBadKey, handler);
    await withIdempotency(reqBadKey, handler);

    expect(handler).toHaveBeenCalledTimes(2); // dedup 안 됨
  });
});

describe("시나리오 20 — 양방향 변경 멱등성 (승인↔반려 토글)", () => {
  test("입고 승인↔반려 5회 토글 — 매번 정합성 유지", async () => {
    store.seed("작업자", ALL_MASTERS.workers);
    store.seed("품목마스터", ALL_MASTERS.products);
    store.seed("보관처 마스터", ALL_MASTERS.storages);
    store.seed("보관처 비용 이력", ALL_MASTERS.storageCosts);

    const { createInventoryRecord } = await import(
      "@/app/actions/inventory/inbound"
    );
    const { updateApprovalStatus } = await import("@/app/actions/admin/admin");

    await createInventoryRecord({
      작업자: WORKER_NORMAL.id,
      품목명: PRODUCT_MACKEREL.fields.품목명 as string,
      입고일자: "2026-05-06",
      규격: "11",
      미수: "26",
      "입고수량(BOX)": 100,
      수매가: 50000,
      storageRecordId: STORAGE_HANRIM.id,
    });
    const inbound = store.list("입고 관리")[0];
    const lot = store.list("LOT별 재고")[0];

    // 승인 → 100
    await updateApprovalStatus(WORKER_ADMIN.id, inbound.id, "INBOUND", "승인 완료");
    expect(store.get("LOT별 재고", lot.id)!.fields.재고수량).toBe(100);

    // 토글 5회: 반려↔승인
    for (let i = 0; i < 5; i++) {
      await updateApprovalStatus(WORKER_ADMIN.id, inbound.id, "INBOUND", "반려");
      expect(store.get("LOT별 재고", lot.id)!.fields.재고수량).toBe(0);
      expect(store.get("LOT별 재고", lot.id)!.fields.냉장료단가).toBeNull();

      await updateApprovalStatus(WORKER_ADMIN.id, inbound.id, "INBOUND", "승인 완료");
      expect(store.get("LOT별 재고", lot.id)!.fields.재고수량).toBe(100);
      expect(store.get("LOT별 재고", lot.id)!.fields.냉장료단가).toBe(1500);
    }
  });

  test("같은 상태로 두 번 PATCH (멱등) — 재고 처리 skip", async () => {
    store.seed("작업자", ALL_MASTERS.workers);
    store.seed("품목마스터", ALL_MASTERS.products);
    store.seed("보관처 마스터", ALL_MASTERS.storages);
    store.seed("보관처 비용 이력", ALL_MASTERS.storageCosts);

    const { createInventoryRecord } = await import(
      "@/app/actions/inventory/inbound"
    );
    const { updateApprovalStatus } = await import("@/app/actions/admin/admin");

    await createInventoryRecord({
      작업자: WORKER_NORMAL.id,
      품목명: PRODUCT_MACKEREL.fields.품목명 as string,
      입고일자: "2026-05-06",
      규격: "11",
      미수: "26",
      "입고수량(BOX)": 100,
      수매가: 50000,
      storageRecordId: STORAGE_HANRIM.id,
    });
    const inbound = store.list("입고 관리")[0];
    const lot = store.list("LOT별 재고")[0];

    // 1차 승인
    await updateApprovalStatus(WORKER_ADMIN.id, inbound.id, "INBOUND", "승인 완료");
    expect(store.get("LOT별 재고", lot.id)!.fields.재고수량).toBe(100);

    // 2차 승인 (같은 상태로) — 멱등 처리
    const r2 = await updateApprovalStatus(
      WORKER_ADMIN.id,
      inbound.id,
      "INBOUND",
      "승인 완료",
    );
    expect(r2.success).toBe(true);
    expect(store.get("LOT별 재고", lot.id)!.fields.재고수량).toBe(100); // 변화 없음
  });
});

describe("시나리오 21 — PDF 생성 실패해도 승인 성공", () => {
  test("입고 승인 — generateInboundPdf 실패해도 success: true + 재고 정상 반영", async () => {
    store.seed("작업자", ALL_MASTERS.workers);
    store.seed("품목마스터", ALL_MASTERS.products);
    store.seed("보관처 마스터", ALL_MASTERS.storages);
    store.seed("보관처 비용 이력", ALL_MASTERS.storageCosts);

    // PDF 생성을 throw하도록 mock 재설정
    const pdfModule = await import("@/lib/generate-pdf.server");
    vi.spyOn(pdfModule, "generateInboundPdf").mockRejectedValueOnce(
      new Error("PDF rendering failed"),
    );

    const { createInventoryRecord } = await import(
      "@/app/actions/inventory/inbound"
    );
    await createInventoryRecord({
      작업자: WORKER_NORMAL.id,
      품목명: PRODUCT_MACKEREL.fields.품목명 as string,
      입고일자: "2026-05-06",
      규격: "11",
      미수: "26",
      "입고수량(BOX)": 100,
      수매가: 50000,
      storageRecordId: STORAGE_HANRIM.id,
    });
    const inbound = store.list("입고 관리")[0];
    const lot = store.list("LOT별 재고")[0];

    const { updateApprovalStatus } = await import("@/app/actions/admin/admin");
    const result = await updateApprovalStatus(
      WORKER_ADMIN.id,
      inbound.id,
      "INBOUND",
      "승인 완료",
    );

    // 승인은 성공
    expect(result.success).toBe(true);
    // 재고는 정상 반영
    expect(store.get("LOT별 재고", lot.id)!.fields.재고수량).toBe(100);
    // 입고 관리 상태도 변경
    expect(store.get("입고 관리", inbound.id)!.fields.승인상태).toBe("승인 완료");
    // 입고증 URL은 PDF 실패로 비어 있어야 함
    expect(store.get("입고 관리", inbound.id)!.fields.입고증URL).toBeUndefined();
  });

  test("출고 승인 — generateOutboundPdf 실패해도 차감 정상 + success", async () => {
    store.seed("작업자", ALL_MASTERS.workers);
    store.seed("품목마스터", ALL_MASTERS.products);
    store.seed("보관처 마스터", ALL_MASTERS.storages);
    store.seed("보관처 비용 이력", ALL_MASTERS.storageCosts);

    const inbound = makeApprovedInboundRecord({
      lotNumber: "260415-MC1-11-26-0001",
      qty: 100,
      remaining: 100,
    });
    const lot = makeInStockLot({
      lotNumber: "260415-MC1-11-26-0001",
      stockQty: 100,
      inboundRecordId: inbound.id,
    });
    store.seed("입고 관리", [inbound]);
    store.seed("LOT별 재고", [lot]);

    const pdfModule = await import("@/lib/generate-pdf.server");
    vi.spyOn(pdfModule, "generateOutboundPdf").mockRejectedValueOnce(
      new Error("PDF rendering failed"),
    );

    const { createOutboundRecord } = await import(
      "@/app/actions/inventory/outbound"
    );
    await createOutboundRecord({
      workerRecordId: WORKER_NORMAL.id,
      lotRecordId: lot.id,
      inboundRecordId: inbound.id,
      quantity: 30,
      date: "2026-05-06",
      seller: "○○수산",
      salePrice: 55000,
    });
    const outbound = store.list("출고 관리")[0];

    const { updateApprovalStatus } = await import("@/app/actions/admin/admin");
    const result = await updateApprovalStatus(
      WORKER_ADMIN.id,
      outbound.id,
      "OUTBOUND",
      "승인 완료",
    );

    expect(result.success).toBe(true);
    // 차감 정상
    expect(store.get("입고 관리", inbound.id)!.fields.잔여수량).toBe(70);
    expect(store.get("LOT별 재고", lot.id)!.fields.재고수량).toBe(70);
    // 출고시점 비용도 정상 PATCH
    expect(
      Number(store.get("출고 관리", outbound.id)!.fields["출고시점 판매원가"]),
    ).toBeGreaterThan(0);
  });
});
