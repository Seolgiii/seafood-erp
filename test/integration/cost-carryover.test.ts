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
 * 옵션 B + 동결비 + 이월 경비 시나리오
 *
 * - 입고 승인 시 보관처 비용 이력의 동결비도 LOT에 저장
 * - 출고 승인 시 동결비 + 이월 4개를 출고시점 판매원가에 합산
 * - 재고 이동 시 새 LOT의 이월 4개를 비례 분할로 저장 + 최초입고일 보존
 * - 이동된 LOT의 재이동 (D1): 원본 비용 + 이월 모두 합산해 다시 비례 분할
 * - 출고 반려 시 출고시점 동결비도 null 복구
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
    expect(out.fields["출고시점 동결비"]).toBe(300);
    // 판매원가에 동결비(300)도 포함되어야 함
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

    // 동결비 채워졌는지 확인
    let out = store.get("출고 관리", outbound.id)!;
    expect(out.fields["출고시점 동결비"]).toBe(300);

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

describe("재고 이동 — 옵션 B (이월 경비 비례 분할)", () => {
  test("이동 승인 시 새 LOT에 최초입고일 보존 + 이월 경비 비례 분할 저장", async () => {
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

    // 새 LOT 수매가 = 원본 수매가 × 0.4 (단가만 이월)
    expect(newLot.fields.수매가).toBe(400_000);

    // 새 LOT 이월 경비 = 원본 비용 × 0.4
    // 누적냉장료는 formula로 계산되는데 store에 저장된 게 없으면 0
    // 입출고비 500 × 0.4 = 200
    // 노조비 200 × 0.4 = 80
    // 동결비 300 × 0.4 = 120
    expect(newLot.fields.이월입출고비).toBe(200);
    expect(newLot.fields.이월노조비).toBe(80);
    expect(newLot.fields.이월동결비).toBe(120);

    // 새 보관처 비용은 부산냉동 (1700/600/250/350)
    expect(newLot.fields.냉장료단가).toBe(1700);
    expect(newLot.fields.입출고비).toBe(600);
    expect(newLot.fields.노조비).toBe(250);
    expect(newLot.fields.동결비).toBe(350);

    // 원본 LOT 최초입고일 변경 안 됨
    const originalAfter = store.get("LOT별 재고", originalLot.id)!;
    expect(originalAfter.fields.최초입고일).toBe("2026-03-01");
    expect(originalAfter.fields.재고수량).toBe(60);
  });

  test("재이동 (D1) — 이미 이월 경비가 있는 LOT을 다시 이동", async () => {
    store.seed("작업자", ALL_MASTERS.workers);
    store.seed("품목마스터", ALL_MASTERS.products);
    store.seed("보관처 마스터", ALL_MASTERS.storages);
    store.seed("보관처 비용 이력", ALL_MASTERS.storageCosts);

    // 한 번 이동되어 이월 경비를 가지고 있는 LOT
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
      purchasePrice: 500_000,
      inboundDate: "2026-03-01",
      transferInboundDate: "2026-04-01", // 한 번 이동된 LOT
      refrigerationFeePerUnit: 1700,
      inOutFee: 600,
      unionFee: 250,
      freezeFee: 350,
      // 이미 이월된 경비 (이전 보관처에서)
      carriedRefrigeration: 4500,  // 누적냉장료 비례 분할
      carriedInOutFee: 200,
      carriedUnionFee: 80,
      carriedFreezeFee: 120,
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

    // 최초입고일은 처음 LOT 만들 때의 날짜 (체인 끝까지 보존)
    expect(newLot.fields.최초입고일).toBe("2026-03-01");
    expect(newLot.fields.이동입고일).toBe("2026-05-15");

    // 새 수매가 = 500_000 × 0.5 = 250_000
    expect(newLot.fields.수매가).toBe(250_000);

    // 새 이월 경비 = (현재 LOT의 비용 + 기존 이월) × 0.5
    // 누적냉장료는 store에 0 → (0 + 4500) × 0.5 = 2250
    // 입출고비 (600 + 200) × 0.5 = 400
    // 노조비 (250 + 80) × 0.5 = 165
    // 동결비 (350 + 120) × 0.5 = 235
    expect(newLot.fields.이월냉장료).toBe(2250);
    expect(newLot.fields.이월입출고비).toBe(400);
    expect(newLot.fields.이월노조비).toBe(165);
    expect(newLot.fields.이월동결비).toBe(235);
  });

  test("이동 후 출고 — 판매원가에 이월 경비도 합산됨", async () => {
    store.seed("작업자", ALL_MASTERS.workers);
    store.seed("품목마스터", ALL_MASTERS.products);
    store.seed("보관처 마스터", ALL_MASTERS.storages);
    store.seed("보관처 비용 이력", ALL_MASTERS.storageCosts);

    // 이미 이동된 LOT (이월 경비 보유)
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
      purchasePrice: 400_000,
      inboundDate: "2026-03-01",
      transferInboundDate: "2026-05-01",
      refrigerationFeePerUnit: 1700,
      inOutFee: 600,
      unionFee: 250,
      freezeFee: 350,
      carriedRefrigeration: 1000,
      carriedInOutFee: 200,
      carriedUnionFee: 80,
      carriedFreezeFee: 120,
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

    // 판매원가 = 단가 + 냉장료 + 입출고비 + 노조비 + 동결비 + 이월 4개
    // 단가 = 400_000 / (40×11) = 909.09...
    // 냉장료 = 1700 × 9일(05-01 ~ 05-10) = 15300
    // 입출고비 + 노조비 + 동결비 = 600+250+350 = 1200
    // 이월 = 1000+200+80+120 = 1400
    // totalCost = 909.09 + 15300 + 1200 + 1400 ≈ 18809
    expect(totalCost).toBeGreaterThan(18_000);
    expect(totalCost).toBeLessThan(20_000);

    // 출고시점 동결비도 저장
    expect(out.fields["출고시점 동결비"]).toBe(350);
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
