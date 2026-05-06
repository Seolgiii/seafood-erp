import { describe, expect, test } from "vitest";
import { store } from "./airtable-store";
import {
  ALL_MASTERS,
  WORKER_ADMIN,
  WORKER_NORMAL,
  makeApprovedInboundRecord,
  makeInStockLot,
} from "./fixtures";

/**
 * 시나리오 12 — 출고 중복 클릭 방지 (멱등 가드)
 *
 * 정책 (admin.ts updateApprovalStatus + deductStockOnOutboundApproval):
 *   - newStatus="승인 완료"일 때 currentStatus가 이미 "승인 완료"면 멱등 처리 (skip)
 *   - deductStock 자체에도 "출고시점 판매원가 > 0"이면 차감 완료로 간주하는 가드
 *   → 같은 출고를 두 번 승인 시도해도 차감은 1회만 발생
 */

describe("시나리오 12 — 출고 중복 클릭 방지", () => {
  test("같은 출고 두 번 승인 — 차감은 1회만 발생", async () => {
    store.seed("작업자", ALL_MASTERS.workers);
    store.seed("품목마스터", ALL_MASTERS.products);
    store.seed("보관처 마스터", ALL_MASTERS.storages);
    store.seed("보관처 비용 이력", ALL_MASTERS.storageCosts);

    const inbound = makeApprovedInboundRecord({
      id: "recINBOUNDORIG001",
      lotNumber: "260415-MC1-11-26-0001",
      qty: 100,
      remaining: 100,
    });
    const lot = makeInStockLot({
      id: "recLOTINSTOCK001",
      lotNumber: "260415-MC1-11-26-0001",
      stockQty: 100,
      inboundRecordId: inbound.id,
    });
    store.seed("입고 관리", [inbound]);
    store.seed("LOT별 재고", [lot]);

    const { createOutboundRecord } = await import(
      "@/app/actions/inventory/outbound"
    );
    const { updateApprovalStatus } = await import("@/app/actions/admin/admin");

    // 출고 신청 (30박스)
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

    // 첫 번째 승인
    const r1 = await updateApprovalStatus(
      WORKER_ADMIN.id,
      outbound.id,
      "OUTBOUND",
      "승인 완료",
    );
    expect(r1.success).toBe(true);
    expect(store.get("입고 관리", inbound.id)!.fields.잔여수량).toBe(70);
    expect(store.get("LOT별 재고", lot.id)!.fields.재고수량).toBe(70);
    const totalCostAfterFirst = Number(
      store.get("출고 관리", outbound.id)!.fields["출고시점 판매원가"],
    );
    expect(totalCostAfterFirst).toBeGreaterThan(0);

    // 두 번째 승인 — 멱등 처리되어야 함
    const r2 = await updateApprovalStatus(
      WORKER_ADMIN.id,
      outbound.id,
      "OUTBOUND",
      "승인 완료",
    );
    expect(r2.success).toBe(true);

    // 차감은 한 번만 — 잔여 70, LOT 70 그대로
    expect(store.get("입고 관리", inbound.id)!.fields.잔여수량).toBe(70);
    expect(store.get("LOT별 재고", lot.id)!.fields.재고수량).toBe(70);

    // 출고시점 판매원가도 변하지 않음 (재계산 X)
    expect(
      Number(store.get("출고 관리", outbound.id)!.fields["출고시점 판매원가"]),
    ).toBe(totalCostAfterFirst);
  });

  test("Promise.all 동시 승인 2회 — 한쪽만 차감", async () => {
    store.seed("작업자", ALL_MASTERS.workers);
    store.seed("품목마스터", ALL_MASTERS.products);
    store.seed("보관처 마스터", ALL_MASTERS.storages);
    store.seed("보관처 비용 이력", ALL_MASTERS.storageCosts);

    const inbound = makeApprovedInboundRecord({
      id: "recINBOUNDORIG002",
      lotNumber: "260415-MC1-11-26-0002",
      qty: 100,
      remaining: 100,
    });
    const lot = makeInStockLot({
      id: "recLOTINSTOCK002",
      lotNumber: "260415-MC1-11-26-0002",
      stockQty: 100,
      inboundRecordId: inbound.id,
    });
    store.seed("입고 관리", [inbound]);
    store.seed("LOT별 재고", [lot]);

    const { createOutboundRecord } = await import(
      "@/app/actions/inventory/outbound"
    );
    const { updateApprovalStatus } = await import("@/app/actions/admin/admin");

    await createOutboundRecord({
      workerRecordId: WORKER_NORMAL.id,
      lotRecordId: lot.id,
      inboundRecordId: inbound.id,
      quantity: 30,
      date: "2026-05-06",
      seller: "××유통",
      salePrice: 55000,
    });
    const outbound = store.list("출고 관리")[0];

    // 동시에 두 번 승인 시도 (사용자가 더블 클릭한 상황)
    const [r1, r2] = await Promise.all([
      updateApprovalStatus(WORKER_ADMIN.id, outbound.id, "OUTBOUND", "승인 완료"),
      updateApprovalStatus(WORKER_ADMIN.id, outbound.id, "OUTBOUND", "승인 완료"),
    ]);

    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);

    // 차감은 한 번만 — 잔여 70, LOT 70
    expect(store.get("입고 관리", inbound.id)!.fields.잔여수량).toBe(70);
    expect(store.get("LOT별 재고", lot.id)!.fields.재고수량).toBe(70);
  });
});
