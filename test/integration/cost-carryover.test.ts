import { describe, expect, test } from "vitest";
import { store } from "./airtable-store";
import {
  ALL_MASTERS,
  PRODUCT_MACKEREL,
  STORAGE_BUSAN,
  STORAGE_HANRIM,
  WORKER_ADMIN,
  WORKER_NORMAL,
  makeApprovedInboundRecord,
  makeInStockLot,
} from "./fixtures";

/**
 * C안 + 동결비 특례 시나리오 (이월 4개 = 총액, 동결비는 이동 시 0)
 *
 * 단위 규약:
 *   박스당: 수매가, 입출고비, 노조비, 동결비, 냉장료단가
 *   총액(원): 이월 4개, 출고시점 비용 7필드(단가 제외), 판매원가/판매금액/손익
 *   원/kg: 출고시점 단가 (스냅샷)
 *
 * 동결비 특례:
 *   - 이동된 LOT의 동결비 = 0 (새 보관처에서 부과 X)
 *   - 이월동결비는 원본 cost basis를 박스당×이동박스수 단위로 보존
 *
 * 시나리오:
 * - 입고 승인 시 보관처 비용 이력의 동결비도 LOT에 저장 (원본 LOT만)
 * - 출고 승인 시 동결비 + 이월 4개를 출고시점 판매원가에 합산 (모두 총액)
 * - 재고 이동 시 새 LOT의 수매가는 박스당 그대로, 이월 4개는 박스당×이동박스수
 * - 이동된 LOT은 동결비=0, 이월동결비만 보존
 * - 다단 이동 (D2/D3)도 박스당 cost basis 누적되어 정확히 보존
 */

describe("동결비 통합", () => {
  test("입고 승인 시 LOT에 보관처 동결비 자동 저장", async () => {
    store.seed("작업자", ALL_MASTERS.workers);
    store.seed("품목마스터", ALL_MASTERS.products);
    store.seed("보관처 마스터", ALL_MASTERS.storages);
    store.seed("보관처 비용 이력", ALL_MASTERS.storageCosts);

    const { createInventoryRecord } = await import(
      "@/app/actions/inventory/inbound"
    );
    const result = await createInventoryRecord({
      작업자: WORKER_NORMAL.id,
      품목명: PRODUCT_MACKEREL.fields.품목명 as string,
      입고일자: "2026-05-06",
      규격: "11",
      미수: "26",
      "입고수량(BOX)": 50,
      수매가: 40_000,
      storageRecordId: STORAGE_HANRIM.id,
    });
    expect(result.success).toBe(true);

    const inbound = store.list("입고 관리")[0];

    const { updateApprovalStatus } = await import(
      "@/app/actions/admin/admin"
    );
    const approval = await updateApprovalStatus(
      WORKER_ADMIN.id,
      inbound.id,
      "INBOUND",
      "승인 완료",
    );
    expect(approval.success).toBe(true);

    const lot = store.list("LOT별 재고")[0];
    expect(lot.fields.냉장료단가).toBe(1500);
    expect(lot.fields.입출고비).toBe(500);
    expect(lot.fields.노조비).toBe(200);
    expect(lot.fields.동결비).toBe(300);
  });

  test("입고 반려 시 동결비도 null로 클리어", async () => {
    store.seed("작업자", ALL_MASTERS.workers);
    store.seed("품목마스터", ALL_MASTERS.products);
    store.seed("보관처 마스터", ALL_MASTERS.storages);
    store.seed("보관처 비용 이력", ALL_MASTERS.storageCosts);

    const { createInventoryRecord } = await import(
      "@/app/actions/inventory/inbound"
    );
    await createInventoryRecord({
      작업자: WORKER_NORMAL.id,
      품목명: PRODUCT_MACKEREL.fields.품목명 as string,
      입고일자: "2026-05-06",
      규격: "11",
      미수: "26",
      "입고수량(BOX)": 50,
      수매가: 40_000,
      storageRecordId: STORAGE_HANRIM.id,
    });
    const inbound = store.list("입고 관리")[0];

    const { updateApprovalStatus } = await import(
      "@/app/actions/admin/admin"
    );
    await updateApprovalStatus(
      WORKER_ADMIN.id,
      inbound.id,
      "INBOUND",
      "승인 완료",
    );

    // 동결비가 채워진 상태에서 반려
    let lot = store.list("LOT별 재고")[0];
    expect(lot.fields.동결비).toBe(300);

    await updateApprovalStatus(
      WORKER_ADMIN.id,
      inbound.id,
      "INBOUND",
      "반려",
      "오발주",
    );

    lot = store.get("LOT별 재고", lot.id)!;
    expect(lot.fields.재고수량).toBe(0);
    expect(lot.fields.냉장료단가).toBeNull();
    expect(lot.fields.입출고비).toBeNull();
    expect(lot.fields.노조비).toBeNull();
    expect(lot.fields.동결비).toBeNull();
  });

  test("출고 승인 시 출고시점 동결비가 LOT.동결비로 저장됨", async () => {
    store.seed("작업자", ALL_MASTERS.workers);
    store.seed("품목마스터", ALL_MASTERS.products);
    store.seed("보관처 마스터", ALL_MASTERS.storages);
    store.seed("보관처 비용 이력", ALL_MASTERS.storageCosts);

    const inbound = makeApprovedInboundRecord({
      lotNumber: "260415-MC1-11-26-0001",
      qty: 100,
    });
    const lot = makeInStockLot({
      lotNumber: "260415-MC1-11-26-0001",
      stockQty: 100,
      inboundRecordId: inbound.id,
      freezeFee: 300,
    });
    store.seed("입고 관리", [inbound]);
    store.seed("LOT별 재고", [lot]);

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
      salePrice: 55_000,
    });
    const outbound = store.list("출고 관리")[0];

    const { updateApprovalStatus } = await import(
      "@/app/actions/admin/admin"
    );
    const approval = await updateApprovalStatus(
      WORKER_ADMIN.id,
      outbound.id,
      "OUTBOUND",
      "승인 완료",
    );
    expect(approval.success).toBe(true);

    const out = store.get("출고 관리", outbound.id)!;
    // 출고시점 동결비 = 박스당(300) × 출고박스(30) + 이월동결비(0) × 비율 = 9000 (총액)
    expect(out.fields["출고시점 동결비"]).toBe(9000);
    // 판매원가에 동결비도 포함되어야 함
    expect(Number(out.fields["출고시점 판매원가"])).toBeGreaterThan(0);
  });

  test("출고 반려 시 출고시점 동결비도 null 복구", async () => {
    store.seed("작업자", ALL_MASTERS.workers);
    store.seed("품목마스터", ALL_MASTERS.products);
    store.seed("보관처 마스터", ALL_MASTERS.storages);
    store.seed("보관처 비용 이력", ALL_MASTERS.storageCosts);

    const inbound = makeApprovedInboundRecord({
      lotNumber: "260415-MC1-11-26-0001",
      qty: 100,
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
    await createOutboundRecord({
      workerRecordId: WORKER_NORMAL.id,
      lotRecordId: lot.id,
      inboundRecordId: inbound.id,
      quantity: 30,
      date: "2026-05-06",
      seller: "○○수산",
      salePrice: 55_000,
    });
    const outbound = store.list("출고 관리")[0];

    const { updateApprovalStatus } = await import(
      "@/app/actions/admin/admin"
    );
    await updateApprovalStatus(
      WORKER_ADMIN.id,
      outbound.id,
      "OUTBOUND",
      "승인 완료",
    );

    // 동결비 채워졌는지 확인 (총액 = 박스당 300 × 출고 30박스)
    let out = store.get("출고 관리", outbound.id)!;
    expect(out.fields["출고시점 동결비"]).toBe(9000);

    // 반려
    await updateApprovalStatus(
      WORKER_ADMIN.id,
      outbound.id,
      "OUTBOUND",
      "반려",
      "주문 취소",
    );
    out = store.get("출고 관리", outbound.id)!;
    expect(out.fields["출고시점 동결비"]).toBeNull();
    expect(out.fields["출고시점 단가"]).toBeNull();
    expect(out.fields["출고시점 판매원가"]).toBeNull();
  });
});

describe("재고 이동 — C안 + 동결비 특례 (이월 경비 박스당×이동박스수)", () => {
  test("이동 승인 시 새 LOT에 최초입고일 보존 + 수매가 박스당 그대로 + 이월 4개 총액", async () => {
    store.seed("작업자", ALL_MASTERS.workers);
    store.seed("품목마스터", ALL_MASTERS.products);
    store.seed("보관처 마스터", ALL_MASTERS.storages);
    store.seed("보관처 비용 이력", ALL_MASTERS.storageCosts);

    const originalInbound = makeApprovedInboundRecord({
      id: "recINBOUNDORIG001",
      lotNumber: "260301-MC1-11-26-0001",
      qty: 100,
      remaining: 100,
      storageId: STORAGE_HANRIM.id,
    });
    const originalLot = makeInStockLot({
      id: "recLOTORIGINAL001",
      lotNumber: "260301-MC1-11-26-0001",
      stockQty: 100,
      inboundRecordId: originalInbound.id,
      storageId: STORAGE_HANRIM.id,
      purchasePrice: 1_000_000,
      inboundDate: "2026-03-01",  // 최초입고일 (이동 안 된 LOT — 이동입고일 null)
      refrigerationFeePerUnit: 1500,
      inOutFee: 500,
      unionFee: 200,
      freezeFee: 300,
    });
    store.seed("입고 관리", [originalInbound]);
    store.seed("LOT별 재고", [originalLot]);

    const { createTransferRecord } = await import(
      "@/app/actions/inventory/transfer"
    );
    await createTransferRecord({
      lotRecordId: originalLot.id,
      이동수량: 40, // 40 / 100 = 0.4 비율
      이동후보관처RecordId: STORAGE_BUSAN.id,
      이동일: "2026-05-01",
      workerId: WORKER_NORMAL.id,
    });
    const transfer = store.list("재고 이동")[0];

    const { updateApprovalStatus } = await import(
      "@/app/actions/admin/admin"
    );
    const approval = await updateApprovalStatus(
      WORKER_ADMIN.id,
      transfer.id,
      "TRANSFER",
      "승인 완료",
    );
    expect(approval.success).toBe(true);

    // 새 LOT 검증
    const allLots = store.list("LOT별 재고");
    const newLot = allLots.find((r) => r.id !== originalLot.id)!;

    // 최초입고일은 원본에서 복사 (변경 X)
    expect(newLot.fields.최초입고일).toBe("2026-03-01");
    // 이동입고일은 이동 승인일
    expect(newLot.fields.이동입고일).toBe("2026-05-01");

    // 새 LOT 수매가 = 원본 수매가 (박스당 그대로, 비례 X)
    expect(newLot.fields.수매가).toBe(1_000_000);

    // 새 LOT 이월 4개 = 원본 박스당 × 이동박스수 (40)
    // 입출고비 500 × 40 = 20_000
    // 노조비 200 × 40 = 8_000
    // 동결비 300 × 40 = 12_000 (cost basis 박스당 보존)
    expect(newLot.fields.이월입출고비).toBe(20_000);
    expect(newLot.fields.이월노조비).toBe(8_000);
    expect(newLot.fields.이월동결비).toBe(12_000);
    // 누적냉장료 (formula 결과) store 0 → 이월냉장료 = 0
    expect(newLot.fields.이월냉장료).toBe(0);

    // 새 보관처 비용은 부산냉동 (1700/600/250/-)
    // 동결비 특례: 새 보관처 동결비 부과 X
    expect(newLot.fields.냉장료단가).toBe(1700);
    expect(newLot.fields.입출고비).toBe(600);
    expect(newLot.fields.노조비).toBe(250);
    expect(newLot.fields.동결비).toBeFalsy(); // 동결비 특례 — 새 LOT은 동결비 0/unset

    // 원본 LOT 최초입고일 변경 안 됨
    const originalAfter = store.get("LOT별 재고", originalLot.id)!;
    expect(originalAfter.fields.최초입고일).toBe("2026-03-01");
    expect(originalAfter.fields.재고수량).toBe(60);
  });

  test("D2 재이동 — 박스당 cost basis 누적해서 다시 이동 (sourceInboxQty=입고박스수)", async () => {
    store.seed("작업자", ALL_MASTERS.workers);
    store.seed("품목마스터", ALL_MASTERS.products);
    store.seed("보관처 마스터", ALL_MASTERS.storages);
    store.seed("보관처 비용 이력", ALL_MASTERS.storageCosts);

    // 한 번 이동된 LOT (D1 결과): 부산냉동, 50박스, 동결비 특례로 0, 이월 4개 보존
    const intermediateInbound = makeApprovedInboundRecord({
      id: "recINBOUNDINTER01",
      lotNumber: "260301-MC1-11-26-0002",
      qty: 50,
      remaining: 50,
      storageId: STORAGE_BUSAN.id,
    });
    const intermediateLot = makeInStockLot({
      id: "recLOTINTERMED01",
      lotNumber: "260301-MC1-11-26-0002",
      stockQty: 50,
      inboundRecordId: intermediateInbound.id,
      storageId: STORAGE_BUSAN.id,
      purchasePrice: 500_000,       // 박스당 (D1 이동 시 그대로 보존됨)
      inboundDate: "2026-03-01",
      transferInboundDate: "2026-04-01", // 한 번 이동된 LOT
      refrigerationFeePerUnit: 1700,
      inOutFee: 600,
      unionFee: 250,
      freezeFee: 0,                 // 동결비 특례 (이동된 LOT)
      // D1 결과로 누적된 이월 cost basis (총액, 50박스 cost)
      carriedRefrigeration: 4500,
      carriedInOutFee: 25_000,      // 500/박스 × 50박스 (원본 한림 cost)
      carriedUnionFee: 10_000,      // 200/박스 × 50박스
      carriedFreezeFee: 15_000,     // 300/박스 × 50박스 (원본 동결비 cost basis 보존)
    });
    store.seed("입고 관리", [intermediateInbound]);
    store.seed("LOT별 재고", [intermediateLot]);

    const { createTransferRecord } = await import(
      "@/app/actions/inventory/transfer"
    );
    await createTransferRecord({
      lotRecordId: intermediateLot.id,
      이동수량: 25, // 25 / 50 = 0.5 비율
      이동후보관처RecordId: STORAGE_HANRIM.id,
      이동일: "2026-05-15",
      workerId: WORKER_NORMAL.id,
    });
    const transfer = store.list("재고 이동")[0];

    const { updateApprovalStatus } = await import(
      "@/app/actions/admin/admin"
    );
    await updateApprovalStatus(
      WORKER_ADMIN.id,
      transfer.id,
      "TRANSFER",
      "승인 완료",
    );

    const allLots = store.list("LOT별 재고");
    const newLot = allLots.find((r) => r.id !== intermediateLot.id)!;

    // 최초입고일 체인 보존
    expect(newLot.fields.최초입고일).toBe("2026-03-01");
    expect(newLot.fields.이동입고일).toBe("2026-05-15");

    // 새 수매가 = 500_000 (박스당 그대로)
    expect(newLot.fields.수매가).toBe(500_000);

    // 새 이월 = (현재 박스당 + 기존이월/sourceInboxQty) × 이동박스수(25)
    // sourceInboxQty = 50 (intermediateLot.입고수량(BOX))
    // 이월냉장료: (0 + 4500/50) × 25 = 90 × 25 = 2250
    // 이월입출고비: (600 + 25000/50) × 25 = (600 + 500) × 25 = 1100 × 25 = 27_500
    // 이월노조비: (250 + 10000/50) × 25 = (250 + 200) × 25 = 450 × 25 = 11_250
    // 이월동결비: (0 + 15000/50) × 25 = 300 × 25 = 7_500 (cost basis 박스당 보존)
    expect(newLot.fields.이월냉장료).toBe(2250);
    expect(newLot.fields.이월입출고비).toBe(27_500);
    expect(newLot.fields.이월노조비).toBe(11_250);
    expect(newLot.fields.이월동결비).toBe(7_500);

    // 새 LOT 동결비 = 0 (특례)
    expect(newLot.fields.동결비).toBeFalsy();
  });

  test("이동 후 출고 — 출고시점 비용은 박스당×출고박스 + 이월×비율 (총액)", async () => {
    store.seed("작업자", ALL_MASTERS.workers);
    store.seed("품목마스터", ALL_MASTERS.products);
    store.seed("보관처 마스터", ALL_MASTERS.storages);
    store.seed("보관처 비용 이력", ALL_MASTERS.storageCosts);

    // 이미 이동된 LOT — 부산냉동 40박스, 동결비 특례로 0, 이월 4개 보존
    const inbound = makeApprovedInboundRecord({
      id: "recINBOUNDPOST001",
      lotNumber: "260301-MC1-11-26-0003",
      qty: 40,
      remaining: 40,
      storageId: STORAGE_BUSAN.id,
    });
    const lot = makeInStockLot({
      id: "recLOTPOST001",
      lotNumber: "260301-MC1-11-26-0003",
      stockQty: 40,
      inboundRecordId: inbound.id,
      storageId: STORAGE_BUSAN.id,
      purchasePrice: 50_000,        // 박스당 (현실적 값)
      inboundDate: "2026-03-01",
      transferInboundDate: "2026-05-01",
      refrigerationFeePerUnit: 1700,
      inOutFee: 600,
      unionFee: 250,
      freezeFee: 0,                 // 동결비 특례
      // 이월 cost basis (총액, 입고박스수=40 기준)
      carriedRefrigeration: 1_000,
      carriedInOutFee: 20_000,      // 500/박스 × 40박스 (원본 한림 입출고비)
      carriedUnionFee: 8_000,       // 200/박스 × 40박스
      carriedFreezeFee: 12_000,     // 300/박스 × 40박스 (원본 동결비 cost basis)
    });
    store.seed("입고 관리", [inbound]);
    store.seed("LOT별 재고", [lot]);

    const { createOutboundRecord } = await import(
      "@/app/actions/inventory/outbound"
    );
    await createOutboundRecord({
      workerRecordId: WORKER_NORMAL.id,
      lotRecordId: lot.id,
      inboundRecordId: inbound.id,
      quantity: 10,
      date: "2026-05-10",
      seller: "○○수산",
      salePrice: 70_000,
    });
    const outbound = store.list("출고 관리")[0];

    const { updateApprovalStatus } = await import(
      "@/app/actions/admin/admin"
    );
    await updateApprovalStatus(
      WORKER_ADMIN.id,
      outbound.id,
      "OUTBOUND",
      "승인 완료",
    );

    const out = store.get("출고 관리", outbound.id)!;
    const totalCost = Number(out.fields["출고시점 판매원가"]);

    // 박스당무게 = 11, inboxQty=40, outQty=10, daysHeld=9
    // 매입원가 = 50000 × 10 = 500_000
    // 냉장료: 1700×9×10 + 1000×(10/40) = 153_000 + 250 = 153_250
    // 입출고비: 600×10 + 20000×0.25 = 6000 + 5000 = 11_000
    // 노조비: 250×10 + 8000×0.25 = 2500 + 2000 = 4_500
    // 동결비: 0×10 + 12000×0.25 = 3_000 (cost basis 박스당 보존)
    // totalCost = 500_000 + 153_250 + 11_000 + 4_500 + 3_000 = 671_750
    expect(totalCost).toBe(671_750);

    // 출고시점 비용 7필드 (단가는 원/kg, 나머지는 총액)
    expect(Number(out.fields["출고시점 단가"])).toBeCloseTo(50_000 / 11, 0); // 4545원/kg
    expect(out.fields["출고시점 냉장료"]).toBe(153_250);
    expect(out.fields["출고시점 입출고비"]).toBe(11_000);
    expect(out.fields["출고시점 노조비"]).toBe(4_500);
    expect(out.fields["출고시점 동결비"]).toBe(3_000); // 원본 동결비 cost basis 박스당 보존

    // 판매금액 = 70000 × 10 = 700_000, 손익 = 700_000 - 671_750 = 28_250
    expect(out.fields["출고시점 판매금액"]).toBe(700_000);
    expect(out.fields["출고시점 손익"]).toBe(28_250);
  });

  test("수매가 박스당 그대로 — 원본 LOT 이동 시 비례 분할 X (이전 버그 fix)", async () => {
    store.seed("작업자", ALL_MASTERS.workers);
    store.seed("품목마스터", ALL_MASTERS.products);
    store.seed("보관처 마스터", ALL_MASTERS.storages);
    store.seed("보관처 비용 이력", ALL_MASTERS.storageCosts);

    const inbound = makeApprovedInboundRecord({
      id: "recINBOUNDPP001",
      lotNumber: "260415-MC1-11-26-0004",
      qty: 10,
      remaining: 10,
      storageId: STORAGE_HANRIM.id,
    });
    const lot = makeInStockLot({
      id: "recLOTPP001",
      lotNumber: "260415-MC1-11-26-0004",
      stockQty: 10,
      inboundRecordId: inbound.id,
      storageId: STORAGE_HANRIM.id,
      purchasePrice: 50_000, // 박스당
    });
    store.seed("입고 관리", [inbound]);
    store.seed("LOT별 재고", [lot]);

    const { createTransferRecord } = await import(
      "@/app/actions/inventory/transfer"
    );
    await createTransferRecord({
      lotRecordId: lot.id,
      이동수량: 5,
      이동후보관처RecordId: STORAGE_BUSAN.id,
      이동일: "2026-05-15",
      workerId: WORKER_NORMAL.id,
    });
    const transfer = store.list("재고 이동")[0];

    const { updateApprovalStatus } = await import(
      "@/app/actions/admin/admin"
    );
    await updateApprovalStatus(
      WORKER_ADMIN.id,
      transfer.id,
      "TRANSFER",
      "승인 완료",
    );

    const newLot = store
      .list("LOT별 재고")
      .find((r) => r.id !== lot.id)!;
    // 박스당 50_000원 그대로 (이전엔 25000으로 절반화돼서 단가 절반 버그 있었음)
    expect(newLot.fields.수매가).toBe(50_000);
  });

  test("동결비 특례 — 이동된 LOT은 동결비=0, 이월동결비만 cost basis 보존", async () => {
    store.seed("작업자", ALL_MASTERS.workers);
    store.seed("품목마스터", ALL_MASTERS.products);
    store.seed("보관처 마스터", ALL_MASTERS.storages);
    store.seed("보관처 비용 이력", ALL_MASTERS.storageCosts);

    // 원본 LOT (한림 50박스, 동결비 300/박스)
    const inbound = makeApprovedInboundRecord({
      id: "recINBOUNDFRZ001",
      lotNumber: "260415-MC1-11-26-0005",
      qty: 50,
      remaining: 50,
      storageId: STORAGE_HANRIM.id,
    });
    const lot = makeInStockLot({
      id: "recLOTFRZ001",
      lotNumber: "260415-MC1-11-26-0005",
      stockQty: 50,
      inboundRecordId: inbound.id,
      storageId: STORAGE_HANRIM.id,
      freezeFee: 300, // 박스당 (원본 LOT은 실값)
    });
    store.seed("입고 관리", [inbound]);
    store.seed("LOT별 재고", [lot]);

    const { createTransferRecord } = await import(
      "@/app/actions/inventory/transfer"
    );
    await createTransferRecord({
      lotRecordId: lot.id,
      이동수량: 20, // 20 / 50
      이동후보관처RecordId: STORAGE_BUSAN.id,
      이동일: "2026-05-15",
      workerId: WORKER_NORMAL.id,
    });
    const transfer = store.list("재고 이동")[0];

    const { updateApprovalStatus } = await import(
      "@/app/actions/admin/admin"
    );
    await updateApprovalStatus(
      WORKER_ADMIN.id,
      transfer.id,
      "TRANSFER",
      "승인 완료",
    );

    const newLot = store
      .list("LOT별 재고")
      .find((r) => r.id !== lot.id)!;

    // 동결비 특례: 새 LOT의 동결비 = 0 (보관처 비용 이력의 350원 적용 X)
    expect(newLot.fields.동결비).toBeFalsy();

    // 이월동결비 = 원본 박스당(300) × 이동박스수(20) = 6000 (cost basis 보존)
    expect(newLot.fields.이월동결비).toBe(6_000);
  });
});

describe("판매금액 자동 계산 (Airtable formula)", () => {
  test("정상 — 출고시점 판매금액 = 판매가 × 출고수량, 손익 = 판매금액 − 판매원가", async () => {
    store.seed("작업자", ALL_MASTERS.workers);
    store.seed("품목마스터", ALL_MASTERS.products);
    store.seed("보관처 마스터", ALL_MASTERS.storages);
    store.seed("보관처 비용 이력", ALL_MASTERS.storageCosts);

    const inbound = makeApprovedInboundRecord({
      lotNumber: "260501-MC1-11-26-0001",
      qty: 100,
    });
    const lot = makeInStockLot({
      lotNumber: "260501-MC1-11-26-0001",
      stockQty: 100,
      inboundRecordId: inbound.id,
    });
    store.seed("입고 관리", [inbound]);
    store.seed("LOT별 재고", [lot]);

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
      salePrice: 55_000,
    });
    const outbound = store.list("출고 관리")[0];

    // formula 시뮬레이션: 판매금액이 POST 직후 채워졌어야 함
    expect(Number(outbound.fields["판매금액"])).toBe(55_000 * 30);

    const { updateApprovalStatus } = await import(
      "@/app/actions/admin/admin"
    );
    const approval = await updateApprovalStatus(
      WORKER_ADMIN.id,
      outbound.id,
      "OUTBOUND",
      "승인 완료",
    );
    expect(approval.success).toBe(true);

    const out = store.get("출고 관리", outbound.id)!;
    const expectedSaleAmount = 55_000 * 30;
    expect(Number(out.fields["출고시점 판매금액"])).toBe(expectedSaleAmount);

    // 손익 = 판매금액 − 판매원가
    const totalCost = Number(out.fields["출고시점 판매원가"]);
    expect(totalCost).toBeGreaterThan(0);
    expect(Number(out.fields["출고시점 손익"])).toBe(
      expectedSaleAmount - totalCost,
    );
  });

  test("판매가 누락 — 판매금액·출고시점 판매금액 = 0, 재고 차감/판매원가 PATCH는 정상", async () => {
    store.seed("작업자", ALL_MASTERS.workers);
    store.seed("품목마스터", ALL_MASTERS.products);
    store.seed("보관처 마스터", ALL_MASTERS.storages);
    store.seed("보관처 비용 이력", ALL_MASTERS.storageCosts);

    const inbound = makeApprovedInboundRecord({
      lotNumber: "260501-MC1-11-26-0002",
      qty: 100,
    });
    const lot = makeInStockLot({
      lotNumber: "260501-MC1-11-26-0002",
      stockQty: 100,
      inboundRecordId: inbound.id,
    });
    store.seed("입고 관리", [inbound]);
    store.seed("LOT별 재고", [lot]);

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
      // salePrice 의도적으로 누락
    });
    const outbound = store.list("출고 관리")[0];

    // 판매가 미입력 → formula 결과 0
    expect(outbound.fields["판매가"]).toBeUndefined();
    expect(Number(outbound.fields["판매금액"])).toBe(0);

    const { updateApprovalStatus } = await import(
      "@/app/actions/admin/admin"
    );
    const approval = await updateApprovalStatus(
      WORKER_ADMIN.id,
      outbound.id,
      "OUTBOUND",
      "승인 완료",
    );
    expect(approval.success).toBe(true);

    // 재고 차감 정상
    expect(store.get("입고 관리", inbound.id)!.fields.잔여수량).toBe(70);
    expect(store.get("LOT별 재고", lot.id)!.fields.재고수량).toBe(70);

    const out = store.get("출고 관리", outbound.id)!;
    // 판매원가 등 비용 PATCH는 정상 동작
    expect(Number(out.fields["출고시점 판매원가"])).toBeGreaterThan(0);
    // 판매금액은 0 — 손익은 -판매원가 (음수)
    expect(Number(out.fields["출고시점 판매금액"])).toBe(0);
    expect(Number(out.fields["출고시점 손익"])).toBe(
      -Number(out.fields["출고시점 판매원가"]),
    );
  });
});
