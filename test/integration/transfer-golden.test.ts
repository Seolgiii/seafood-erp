import { describe, expect, test } from "vitest";
import { store } from "./airtable-store";
import {
  ALL_MASTERS,
  STORAGE_BUSAN,
  STORAGE_HANRIM,
  WORKER_ADMIN,
  WORKER_NORMAL,
  makeApprovedInboundRecord,
  makeInStockLot,
} from "./fixtures";

/**
 * 시나리오 3 — 재고 이동 골든패스
 *
 * 흐름:
 *   1. 한림냉동에 100박스 재고 LOT 준비
 *   2. 작업자가 30박스를 부산냉동으로 이동 신청 (createTransferRecord)
 *      → 재고 이동 레코드 생성 (승인 대기)
 *   3. 관리자 승인 (updateApprovalStatus TRANSFER, "승인 완료")
 *      → 새 입고관리 레코드 생성 (보관처=부산냉동, 비고="재고 이동", 승인 완료)
 *      → 새 LOT별 재고 생성 (재고수량=30, 보관처=부산냉동)
 *      → 원본 LOT 차감 (재고수량 100 → 70)
 *      → 원본 입고관리 잔여수량 차감 (100 → 70)
 *      → 재고 이동.승인상태 = "승인 완료"
 */

describe("재고 이동 골든패스", () => {
  test("이동 신청 → 승인 → 새 LOT 생성 + 원본 차감", async () => {
    // ── 1. 마스터 + 원본 입고/LOT seed (한림냉동) ──
    store.seed("작업자", ALL_MASTERS.workers);
    store.seed("품목마스터", ALL_MASTERS.products);
    store.seed("보관처 마스터", ALL_MASTERS.storages);
    store.seed("보관처 비용 이력", ALL_MASTERS.storageCosts);

    const originalInbound = makeApprovedInboundRecord({
      id: "recINBOUNDORIG001",
      lotNumber: "260415-MC1-11-26-0001",
      qty: 100,
      remaining: 100,
      storageId: STORAGE_HANRIM.id,
    });
    const originalLot = makeInStockLot({
      id: "recLOTORIGINAL001",
      lotNumber: "260415-MC1-11-26-0001",
      stockQty: 100,
      inboundRecordId: originalInbound.id,
      storageId: STORAGE_HANRIM.id,
    });
    store.seed("입고 관리", [originalInbound]);
    store.seed("LOT별 재고", [originalLot]);

    // ── 2. 재고 이동 신청 ──
    const { createTransferRecord } = await import(
      "@/app/actions/inventory/transfer"
    );
    const transferResult = await createTransferRecord({
      lotRecordId: originalLot.id,
      이동수량: 30,
      이동후보관처RecordId: STORAGE_BUSAN.id,
      이동일: "2026-05-06",
      workerId: WORKER_NORMAL.id,
    });

    expect(transferResult.success).toBe(true);

    // 재고 이동 레코드 (승인 대기)
    const transferRecords = store.list("재고 이동");
    expect(transferRecords).toHaveLength(1);
    const transfer = transferRecords[0];
    expect(transfer.fields.승인상태).toBe("승인 대기");
    expect(transfer.fields.이동수량).toBe(30);

    // 신청 단계에선 원본 LOT/입고 변경 X
    expect(store.get("LOT별 재고", originalLot.id)!.fields.재고수량).toBe(100);
    expect(store.get("입고 관리", originalInbound.id)!.fields.잔여수량).toBe(
      100,
    );

    // ── 3. 관리자 승인 ──
    const { updateApprovalStatus } = await import(
      "@/app/actions/admin/admin"
    );
    const approvalResult = await updateApprovalStatus(
      WORKER_ADMIN.id,
      transfer.id,
      "TRANSFER",
      "승인 완료",
    );

    expect(approvalResult.success).toBe(true);

    // ── 4. 검증: 새 LOT 생성 ──
    const allLots = store.list("LOT별 재고");
    expect(allLots).toHaveLength(2); // 원본 + 새 LOT

    const newLot = allLots.find((r) => r.id !== originalLot.id)!;
    expect(newLot.fields.재고수량).toBe(30);
    // 새 LOT의 보관처는 이동 후 보관처(부산냉동)
    expect(newLot.fields.보관처).toEqual([STORAGE_BUSAN.id]);

    // 새 입고 관리 레코드 (총 2개)
    const allInbounds = store.list("입고 관리");
    expect(allInbounds).toHaveLength(2);
    const newInbound = allInbounds.find((r) => r.id !== originalInbound.id)!;
    expect(newInbound.fields.승인상태).toBe("승인 완료");
    expect(newInbound.fields.비고).toBe("재고 이동");
    expect(newInbound.fields.보관처).toEqual([STORAGE_BUSAN.id]);

    // 원본 LOT 차감
    expect(store.get("LOT별 재고", originalLot.id)!.fields.재고수량).toBe(70);
    // 원본 입고관리 잔여수량 차감
    expect(store.get("입고 관리", originalInbound.id)!.fields.잔여수량).toBe(
      70,
    );

    // 재고 이동 레코드 상태
    expect(store.get("재고 이동", transfer.id)!.fields.승인상태).toBe(
      "승인 완료",
    );
  });
});
