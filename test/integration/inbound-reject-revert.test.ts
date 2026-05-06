import { describe, expect, test } from "vitest";
import { store } from "./airtable-store";
import {
  ALL_MASTERS,
  PRODUCT_MACKEREL,
  STORAGE_HANRIM,
  WORKER_ADMIN,
  WORKER_NORMAL,
} from "./fixtures";

/**
 * 시나리오 5 — 입고 반려 시 LOT 복구 (soft delete)
 * 시나리오 6 — 반려 후 재승인 시 LOT 재고 자동 복원
 *
 * 정책 (admin.ts revertLotOnInboundReject):
 *   - 승인 완료 → 반려: LOT.재고수량 = 0, 보관처 비용 3필드 null
 *   - LOT 레코드 자체는 유지 (soft delete) — 다른 참조 보존
 *   - 다시 승인 완료: createLotOnInboundApproval 재실행 → 재고 복원
 *   - 멱등성: 반려↔승인 반복해도 정합성 유지
 */

async function setupApprovedInbound() {
  store.seed("작업자", ALL_MASTERS.workers);
  store.seed("품목마스터", ALL_MASTERS.products);
  store.seed("보관처 마스터", ALL_MASTERS.storages);
  store.seed("보관처 비용 이력", ALL_MASTERS.storageCosts);

  const { createInventoryRecord } = await import(
    "@/app/actions/inventory/inbound"
  );
  const { updateApprovalStatus } = await import("@/app/actions/admin/admin");

  // 신청
  const inboundResult = await createInventoryRecord({
    작업자: WORKER_NORMAL.id,
    품목명: PRODUCT_MACKEREL.fields.품목명 as string,
    입고일자: "2026-05-06",
    규격: "11",
    미수: "26",
    "입고수량(BOX)": 100,
    수매가: 50000,
    storageRecordId: STORAGE_HANRIM.id,
  });
  expect(inboundResult.success).toBe(true);

  const inbound = store.list("입고 관리")[0];
  const lot = store.list("LOT별 재고")[0];

  // 승인 → 재고 100 반영, 보관처 비용 PATCH
  const approveResult = await updateApprovalStatus(
    WORKER_ADMIN.id,
    inbound.id,
    "INBOUND",
    "승인 완료",
  );
  expect(approveResult.success).toBe(true);
  expect(store.get("LOT별 재고", lot.id)!.fields.재고수량).toBe(100);

  return { inbound, lot, updateApprovalStatus };
}

describe("시나리오 5 — 입고 반려 시 LOT 복구", () => {
  test("승인 완료 → 반려: LOT 재고 0 + 보관처 비용 null", async () => {
    const { inbound, lot, updateApprovalStatus } = await setupApprovedInbound();

    // 반려
    const rejectResult = await updateApprovalStatus(
      WORKER_ADMIN.id,
      inbound.id,
      "INBOUND",
      "반려",
      "수매가 오기재로 반려",
    );
    expect(rejectResult.success).toBe(true);

    // LOT 레코드는 유지 (soft delete) — 참조 보존
    const lotAfter = store.get("LOT별 재고", lot.id);
    expect(lotAfter).not.toBeNull();
    // 재고수량 0
    expect(lotAfter!.fields.재고수량).toBe(0);
    // 보관처 비용 3필드 null
    expect(lotAfter!.fields.냉장료단가).toBeNull();
    expect(lotAfter!.fields.입출고비).toBeNull();
    expect(lotAfter!.fields.노조비).toBeNull();

    // 입고 관리 상태 + 반려사유
    const inboundAfter = store.get("입고 관리", inbound.id)!;
    expect(inboundAfter.fields.승인상태).toBe("반려");
    expect(inboundAfter.fields.반려사유).toBe("수매가 오기재로 반려");
  });

  test("이미 반려된 건 다시 반려해도 멱등 (재고 그대로)", async () => {
    const { inbound, lot, updateApprovalStatus } = await setupApprovedInbound();

    await updateApprovalStatus(WORKER_ADMIN.id, inbound.id, "INBOUND", "반려", "1차 반려");
    expect(store.get("LOT별 재고", lot.id)!.fields.재고수량).toBe(0);

    // 두 번째 반려 — 멱등 처리
    const result2 = await updateApprovalStatus(
      WORKER_ADMIN.id,
      inbound.id,
      "INBOUND",
      "반려",
      "2차 반려",
    );
    expect(result2.success).toBe(true);

    // 재고 0 그대로 (재고 처리 skip)
    expect(store.get("LOT별 재고", lot.id)!.fields.재고수량).toBe(0);
    // 사유는 갱신
    expect(store.get("입고 관리", inbound.id)!.fields.반려사유).toBe("2차 반려");
  });
});

describe("시나리오 6 — 입고 재승인 (반려 → 승인)", () => {
  test("반려 후 다시 승인 완료 → LOT 재고 100 복원 + 비용 다시 채움", async () => {
    const { inbound, lot, updateApprovalStatus } = await setupApprovedInbound();

    // 반려
    await updateApprovalStatus(WORKER_ADMIN.id, inbound.id, "INBOUND", "반려");
    expect(store.get("LOT별 재고", lot.id)!.fields.재고수량).toBe(0);

    // 재승인
    const reapproveResult = await updateApprovalStatus(
      WORKER_ADMIN.id,
      inbound.id,
      "INBOUND",
      "승인 완료",
    );
    expect(reapproveResult.success).toBe(true);

    // LOT 재고 복원
    const lotAfter = store.get("LOT별 재고", lot.id)!;
    expect(lotAfter.fields.재고수량).toBe(100);
    // 보관처 비용 다시 PATCH
    expect(lotAfter.fields.냉장료단가).toBe(1500);
    expect(lotAfter.fields.입출고비).toBe(500);
    expect(lotAfter.fields.노조비).toBe(200);

    // 입고 관리 상태
    expect(store.get("입고 관리", inbound.id)!.fields.승인상태).toBe("승인 완료");
  });

  test("승인 ↔ 반려 반복 — 정합성 유지", async () => {
    const { inbound, lot, updateApprovalStatus } = await setupApprovedInbound();

    // 1. 승인 → 반려 → 승인 → 반려 → 승인
    await updateApprovalStatus(WORKER_ADMIN.id, inbound.id, "INBOUND", "반려");
    expect(store.get("LOT별 재고", lot.id)!.fields.재고수량).toBe(0);

    await updateApprovalStatus(WORKER_ADMIN.id, inbound.id, "INBOUND", "승인 완료");
    expect(store.get("LOT별 재고", lot.id)!.fields.재고수량).toBe(100);

    await updateApprovalStatus(WORKER_ADMIN.id, inbound.id, "INBOUND", "반려");
    expect(store.get("LOT별 재고", lot.id)!.fields.재고수량).toBe(0);
    expect(store.get("LOT별 재고", lot.id)!.fields.냉장료단가).toBeNull();

    await updateApprovalStatus(WORKER_ADMIN.id, inbound.id, "INBOUND", "승인 완료");
    expect(store.get("LOT별 재고", lot.id)!.fields.재고수량).toBe(100);
    expect(store.get("LOT별 재고", lot.id)!.fields.냉장료단가).toBe(1500);
  });
});
