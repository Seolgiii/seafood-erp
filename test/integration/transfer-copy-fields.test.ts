import { beforeEach, describe, expect, test } from "vitest";
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
 * 이동 새 LOT/입고관리 — 매입 시점 정보가 원본에서 복사되는지 검증.
 *
 * 의도:
 *  - 매입자/매입처/입고자/선박명/원산지/비고는 매입 시점에 결정된 정보 → 원본 유지
 *  - 입고관리.작업자는 "이 입고 레코드를 만든 사람" → 이동 처리자(workerId)로 갱신
 *  - 입고관리.비고는 "재고 이동" 고정 (이동 표기)
 */

describe("이동 새 LOT/입고관리 — 원본 매입정보 복사", () => {
  beforeEach(() => {
    store.reset();
  });

  test("매입자/매입처/입고자/선박명/원산지가 원본에서 복사되고 비고는 원본 LOT 비고가 복사됨", async () => {
    store.seed("작업자", ALL_MASTERS.workers);
    store.seed("품목마스터", ALL_MASTERS.products);
    store.seed("보관처 마스터", ALL_MASTERS.storages);
    store.seed("보관처 비용 이력", ALL_MASTERS.storageCosts);

    const PURCHASER_ID = "recPURCHASER00001";
    const STOCKER_ID = "recSTOCKER0000001";
    const SUPPLIER_ID = "recSUPPLIER000001";

    store.seed("작업자", [
      {
        id: PURCHASER_ID,
        fields: { 작업자명: "매입자A", 활성: 1, 권한: "WORKER" },
      },
      {
        id: STOCKER_ID,
        fields: { 작업자명: "입고자B", 활성: 1, 권한: "WORKER" },
      },
    ]);
    store.seed("매입처 마스터", [
      { id: SUPPLIER_ID, fields: { 매입처명: "원본거래처" } },
    ]);

    const origInbound = makeApprovedInboundRecord({
      id: "recINBOUNDORIG010",
      lotNumber: "260415-MC1-11-26-0010",
      qty: 100,
      remaining: 100,
      storageId: STORAGE_HANRIM.id,
    });
    origInbound.fields.매입자 = [PURCHASER_ID];
    origInbound.fields.매입처 = [SUPPLIER_ID];
    origInbound.fields.선박명 = "오대양호";
    origInbound.fields.원산지 = "원양";

    const origLot = makeInStockLot({
      id: "recLOTORIGINAL010",
      lotNumber: "260415-MC1-11-26-0010",
      stockQty: 100,
      inboundRecordId: origInbound.id,
      storageId: STORAGE_HANRIM.id,
    });
    origLot.fields.매입자 = [PURCHASER_ID];
    origLot.fields.매입처 = [SUPPLIER_ID];
    origLot.fields.입고자 = [STOCKER_ID];
    origLot.fields.선박명 = "오대양호";
    origLot.fields.원산지 = "원양";
    origLot.fields.비고 = "11월 입고분";

    store.seed("입고 관리", [origInbound]);
    store.seed("LOT별 재고", [origLot]);

    const { createTransferRecord } = await import(
      "@/app/actions/inventory/transfer"
    );
    const tfRes = await createTransferRecord({
      lotRecordId: origLot.id,
      이동수량: 30,
      이동후보관처RecordId: STORAGE_BUSAN.id,
      이동일: "2026-05-06",
      workerId: WORKER_NORMAL.id,
    });
    expect(tfRes.success).toBe(true);

    const transfer = store.list("재고 이동")[0];
    const { updateApprovalStatus } = await import("@/app/actions/admin/admin");
    const apRes = await updateApprovalStatus(
      WORKER_ADMIN.id,
      transfer.id,
      "TRANSFER",
      "승인 완료",
    );
    expect(apRes.success).toBe(true);

    const newInbound = store
      .list("입고 관리")
      .find((r) => r.id !== origInbound.id)!;
    expect(newInbound.fields.매입자).toEqual([PURCHASER_ID]);
    expect(newInbound.fields.매입처).toEqual([SUPPLIER_ID]);
    expect(newInbound.fields.선박명).toBe("오대양호");
    expect(newInbound.fields.원산지).toBe("원양");
    expect(newInbound.fields.작업자).toEqual([WORKER_NORMAL.id]); // 이동 처리자 그대로
    expect(newInbound.fields.비고).toBe("재고 이동"); // 의도된 표기 유지

    const newLot = store
      .list("LOT별 재고")
      .find((r) => r.id !== origLot.id)!;
    expect(newLot.fields.매입자).toEqual([PURCHASER_ID]);
    expect(newLot.fields.매입처).toEqual([SUPPLIER_ID]);
    expect(newLot.fields.입고자).toEqual([STOCKER_ID]);
    expect(newLot.fields.선박명).toBe("오대양호");
    expect(newLot.fields.원산지).toBe("원양");
    expect(newLot.fields.비고).toBe("11월 입고분"); // 원본 LOT 비고 그대로
  });

  test("원본에 비고/선박명이 비어있으면 새 LOT에도 채우지 않음 (입고자는 입고관리.작업자로 fallback)", async () => {
    store.seed("작업자", ALL_MASTERS.workers);
    store.seed("품목마스터", ALL_MASTERS.products);
    store.seed("보관처 마스터", ALL_MASTERS.storages);
    store.seed("보관처 비용 이력", ALL_MASTERS.storageCosts);

    const origInbound = makeApprovedInboundRecord({
      id: "recINBOUNDORIG011",
      lotNumber: "260415-MC1-11-26-0011",
      qty: 50,
      remaining: 50,
      storageId: STORAGE_HANRIM.id,
    });
    const origLot = makeInStockLot({
      id: "recLOTORIGINAL011",
      lotNumber: "260415-MC1-11-26-0011",
      stockQty: 50,
      inboundRecordId: origInbound.id,
      storageId: STORAGE_HANRIM.id,
    });
    // 매입자/입고자/선박명/비고 모두 비워둠 (fixture 기본값)

    store.seed("입고 관리", [origInbound]);
    store.seed("LOT별 재고", [origLot]);

    const { createTransferRecord } = await import(
      "@/app/actions/inventory/transfer"
    );
    await createTransferRecord({
      lotRecordId: origLot.id,
      이동수량: 20,
      이동후보관처RecordId: STORAGE_BUSAN.id,
      이동일: "2026-05-06",
      workerId: WORKER_NORMAL.id,
    });
    const transfer = store.list("재고 이동")[0];
    const { updateApprovalStatus } = await import("@/app/actions/admin/admin");
    const apRes = await updateApprovalStatus(
      WORKER_ADMIN.id,
      transfer.id,
      "TRANSFER",
      "승인 완료",
    );
    expect(apRes.success).toBe(true);

    const newLot = store
      .list("LOT별 재고")
      .find((r) => r.id !== origLot.id)!;
    expect(newLot.fields.선박명).toBeUndefined();
    expect(newLot.fields.비고).toBeUndefined();
    // 원본 LOT에 입고자 없으면 원본 입고관리.작업자로 fallback
    expect(newLot.fields.입고자).toEqual([WORKER_NORMAL.id]);
  });
});
