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
 * 시나리오 7 — 출고 반려 시 재고 복구
 *
 * 정책 (admin.ts restoreStockOnOutboundReject):
 *   - 승인 완료 → 반려 시:
 *     - 입고관리.잔여수량 += 출고수량 (복구)
 *     - LOT별 재고.재고수량 += 출고수량 (복구)
 *     - 출고시점 비용 7개 필드 null로 클리어 (손익 보고서 제외)
 */

async function setupApprovedOutbound() {
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

  // 출고 신청 + 승인
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

  await updateApprovalStatus(WORKER_ADMIN.id, outbound.id, "OUTBOUND", "승인 완료");
  // 차감 확인
  expect(store.get("입고 관리", inbound.id)!.fields.잔여수량).toBe(70);
  expect(store.get("LOT별 재고", lot.id)!.fields.재고수량).toBe(70);
  expect(Number(store.get("출고 관리", outbound.id)!.fields["출고시점 판매원가"]))
    .toBeGreaterThan(0);

  return { inbound, lot, outbound, updateApprovalStatus };
}

describe("시나리오 7 — 출고 반려 시 재고 복구", () => {
  test("승인 완료 → 반려: 잔여수량/LOT재고 +30 복구 + 출고시점 비용 7필드 null", async () => {
    const { inbound, lot, outbound, updateApprovalStatus } =
      await setupApprovedOutbound();

    const rejectResult = await updateApprovalStatus(
      WORKER_ADMIN.id,
      outbound.id,
      "OUTBOUND",
      "반려",
      "판매처 변경 요청",
    );
    expect(rejectResult.success).toBe(true);

    // 잔여수량 복구
    expect(store.get("입고 관리", inbound.id)!.fields.잔여수량).toBe(100);
    // LOT 재고 복구
    expect(store.get("LOT별 재고", lot.id)!.fields.재고수량).toBe(100);

    // 출고시점 비용 7개 필드 null
    const outAfter = store.get("출고 관리", outbound.id)!;
    expect(outAfter.fields.승인상태).toBe("반려");
    expect(outAfter.fields["출고시점 단가"]).toBeNull();
    expect(outAfter.fields["출고시점 냉장료"]).toBeNull();
    expect(outAfter.fields["출고시점 입출고비"]).toBeNull();
    expect(outAfter.fields["출고시점 노조비"]).toBeNull();
    expect(outAfter.fields["출고시점 판매원가"]).toBeNull();
    expect(outAfter.fields["출고시점 판매금액"]).toBeNull();
    expect(outAfter.fields["출고시점 손익"]).toBeNull();
    // 반려사유
    expect(outAfter.fields.반려사유).toBe("판매처 변경 요청");
  });

  test("출고 반려 후 재승인 → 다시 차감 (멱등성)", async () => {
    const { inbound, lot, outbound, updateApprovalStatus } =
      await setupApprovedOutbound();

    // 반려
    await updateApprovalStatus(WORKER_ADMIN.id, outbound.id, "OUTBOUND", "반려");
    expect(store.get("LOT별 재고", lot.id)!.fields.재고수량).toBe(100);

    // 재승인
    await updateApprovalStatus(WORKER_ADMIN.id, outbound.id, "OUTBOUND", "승인 완료");
    expect(store.get("입고 관리", inbound.id)!.fields.잔여수량).toBe(70);
    expect(store.get("LOT별 재고", lot.id)!.fields.재고수량).toBe(70);
    expect(
      Number(store.get("출고 관리", outbound.id)!.fields["출고시점 판매원가"]),
    ).toBeGreaterThan(0);
  });
});
