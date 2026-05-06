import { describe, expect, test, vi } from "vitest";
import { store } from "./airtable-store";
import {
  ALL_MASTERS,
  PRODUCT_MACKEREL,
  STORAGE_HANRIM,
  WORKER_NORMAL,
  makeApprovedInboundRecord,
  makeInStockLot,
} from "./fixtures";

/**
 * 시나리오 16 — 음수 수량 거부
 * 시나리오 17 — 재고보다 많은 출고 거부
 * 시나리오 18 — zod 스키마 검증 모니터링 ([SCHEMA-MISMATCH] 로그)
 */

describe("시나리오 16 — 음수 / 0 수량 거부", () => {
  test("입고 신청에 0박스 → 거부", async () => {
    store.seed("작업자", ALL_MASTERS.workers);
    store.seed("품목마스터", ALL_MASTERS.products);
    store.seed("보관처 마스터", ALL_MASTERS.storages);

    const { createInventoryRecord } = await import(
      "@/app/actions/inventory/inbound"
    );
    const result = await createInventoryRecord({
      작업자: WORKER_NORMAL.id,
      품목명: PRODUCT_MACKEREL.fields.품목명 as string,
      입고일자: "2026-05-06",
      규격: "11",
      미수: "26",
      "입고수량(BOX)": 0,
      수매가: 50000,
      storageRecordId: STORAGE_HANRIM.id,
    });
    expect(result.success).toBe(false);
    expect(store.list("입고 관리")).toHaveLength(0);
  });

  test("입고 신청에 음수 수량 → 거부", async () => {
    store.seed("작업자", ALL_MASTERS.workers);
    store.seed("품목마스터", ALL_MASTERS.products);
    store.seed("보관처 마스터", ALL_MASTERS.storages);

    const { createInventoryRecord } = await import(
      "@/app/actions/inventory/inbound"
    );
    const result = await createInventoryRecord({
      작업자: WORKER_NORMAL.id,
      품목명: PRODUCT_MACKEREL.fields.품목명 as string,
      입고일자: "2026-05-06",
      규격: "11",
      미수: "26",
      "입고수량(BOX)": -10,
      수매가: 50000,
      storageRecordId: STORAGE_HANRIM.id,
    });
    expect(result.success).toBe(false);
    expect(store.list("입고 관리")).toHaveLength(0);
  });

  test("출고 신청에 음수 수량 → 거부", async () => {
    store.seed("작업자", ALL_MASTERS.workers);
    store.seed("품목마스터", ALL_MASTERS.products);
    store.seed("보관처 마스터", ALL_MASTERS.storages);

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

    const { createOutboundRecord } = await import(
      "@/app/actions/inventory/outbound"
    );
    const result = await createOutboundRecord({
      workerRecordId: WORKER_NORMAL.id,
      lotRecordId: lot.id,
      inboundRecordId: inbound.id,
      quantity: -5,
      date: "2026-05-06",
      seller: "○○수산",
      salePrice: 55000,
    });
    expect(result.success).toBe(false);
    expect(store.list("출고 관리")).toHaveLength(0);
  });
});

describe("시나리오 17 — 재고보다 많은 출고 거부", () => {
  test("LOT 50박스 잔여인데 100박스 출고 신청 → 신청 단계 거부", async () => {
    store.seed("작업자", ALL_MASTERS.workers);
    store.seed("품목마스터", ALL_MASTERS.products);
    store.seed("보관처 마스터", ALL_MASTERS.storages);

    const inbound = makeApprovedInboundRecord({
      lotNumber: "260415-MC1-11-26-0001",
      qty: 100,
      remaining: 50, // 이미 50박스 출고됨
    });
    const lot = makeInStockLot({
      lotNumber: "260415-MC1-11-26-0001",
      stockQty: 50,
      inboundRecordId: inbound.id,
    });
    store.seed("입고 관리", [inbound]);
    store.seed("LOT별 재고", [lot]);

    const { createOutboundRecord } = await import(
      "@/app/actions/inventory/outbound"
    );
    const result = await createOutboundRecord({
      workerRecordId: WORKER_NORMAL.id,
      lotRecordId: lot.id,
      inboundRecordId: inbound.id,
      quantity: 100, // 재고 50보다 많음
      date: "2026-05-06",
      seller: "○○수산",
      salePrice: 55000,
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/잔여수량/);
    // 출고 관리 레코드 생성되지 않음
    expect(store.list("출고 관리")).toHaveLength(0);
    // 잔여수량/LOT재고도 변경 없음
    expect(store.get("입고 관리", inbound.id)!.fields.잔여수량).toBe(50);
    expect(store.get("LOT별 재고", lot.id)!.fields.재고수량).toBe(50);
  });

  test("정확히 잔여수량만큼 출고 → 통과", async () => {
    store.seed("작업자", ALL_MASTERS.workers);
    store.seed("품목마스터", ALL_MASTERS.products);
    store.seed("보관처 마스터", ALL_MASTERS.storages);

    const inbound = makeApprovedInboundRecord({
      lotNumber: "260415-MC1-11-26-0002",
      qty: 50,
      remaining: 50,
    });
    const lot = makeInStockLot({
      lotNumber: "260415-MC1-11-26-0002",
      stockQty: 50,
      inboundRecordId: inbound.id,
    });
    store.seed("입고 관리", [inbound]);
    store.seed("LOT별 재고", [lot]);

    const { createOutboundRecord } = await import(
      "@/app/actions/inventory/outbound"
    );
    const result = await createOutboundRecord({
      workerRecordId: WORKER_NORMAL.id,
      lotRecordId: lot.id,
      inboundRecordId: inbound.id,
      quantity: 50,
      date: "2026-05-06",
      seller: "○○수산",
      salePrice: 55000,
    });
    expect(result.success).toBe(true);
  });
});

describe("시나리오 18 — zod 스키마 검증 모니터링", () => {
  test("작업자 fields가 형식 위반이면 [SCHEMA-MISMATCH] console.warn", async () => {
    // 비정상 작업자: 활성 필드 타입 위반은 schema의 union으로 통과되지만,
    // PIN을 객체로 넣으면 union(string|number)에 해당 안 됨 → mismatch
    store.seed("작업자", [
      {
        id: WORKER_NORMAL.id,
        fields: {
          작업자명: "직원C",
          PIN: { invalid: "object" } as never, // schema 위반
          활성: 1,
          권한: "WORKER",
        },
      },
    ]);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { verifyWorkerPin } = await import("@/lib/airtable");
    // PIN이 깨졌으니 매칭은 실패하지만, 스키마 검증 경고는 발생해야 함
    await verifyWorkerPin(WORKER_NORMAL.id, "3333");

    // [SCHEMA-MISMATCH] prefix 로그가 한 번 이상 호출됐는지
    const calls = warnSpy.mock.calls.map((c) => String(c[0] ?? ""));
    expect(calls.some((s) => s.includes("[SCHEMA-MISMATCH]"))).toBe(true);
    expect(calls.some((s) => s.includes("verifyWorkerPin"))).toBe(true);

    warnSpy.mockRestore();
  });

  test("정상 형식이면 [SCHEMA-MISMATCH] 로그 없음 (모니터링이 노이즈를 만들지 않음)", async () => {
    store.seed("작업자", ALL_MASTERS.workers);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { verifyWorkerPin } = await import("@/lib/airtable");
    await verifyWorkerPin(WORKER_NORMAL.id, "3333");

    const calls = warnSpy.mock.calls.map((c) => String(c[0] ?? ""));
    expect(calls.some((s) => s.includes("[SCHEMA-MISMATCH]"))).toBe(false);

    warnSpy.mockRestore();
  });
});
