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
 * TRANSFER 반려 자동 복구 시나리오 (안전 가드 3종)
 *
 * 1. 정상 자동 복구 — 후속 작업 없음 → 원본 +이동수량 / 신규 LOT·입고관리 soft delete
 * 2. 검사 (c) 차단 — 신규 LOT에서 출고 발생 → 반려 차단, 데이터 변화 없음
 * 3. 검사 (b) 차단 — 신규 LOT을 원본으로 한 재이동 활성 → 반려 차단
 */

async function seedAndApproveTransfer(opts: {
  origLotId: string;
  origInboundId: string;
  origQty: number;
  이동수량: number;
}) {
  store.reset();
  store.seed("작업자", ALL_MASTERS.workers);
  store.seed("품목마스터", ALL_MASTERS.products);
  store.seed("보관처 마스터", ALL_MASTERS.storages);
  store.seed("보관처 비용 이력", ALL_MASTERS.storageCosts);

  const originalInbound = makeApprovedInboundRecord({
    id: opts.origInboundId,
    lotNumber: "260415-MC1-11-26-0001",
    qty: opts.origQty,
    remaining: opts.origQty,
    storageId: STORAGE_HANRIM.id,
  });
  const originalLot = makeInStockLot({
    id: opts.origLotId,
    lotNumber: "260415-MC1-11-26-0001",
    stockQty: opts.origQty,
    inboundRecordId: originalInbound.id,
    storageId: STORAGE_HANRIM.id,
  });
  store.seed("입고 관리", [originalInbound]);
  store.seed("LOT별 재고", [originalLot]);

  const { createTransferRecord } = await import(
    "@/app/actions/inventory/transfer"
  );
  const tfRes = await createTransferRecord({
    lotRecordId: opts.origLotId,
    이동수량: opts.이동수량,
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

  const allLots = store.list("LOT별 재고");
  const allInbounds = store.list("입고 관리");
  const newLot = allLots.find((r) => r.id !== opts.origLotId)!;
  const newInbound = allInbounds.find((r) => r.id !== opts.origInboundId)!;

  return { transfer, newLot, newInbound };
}

describe("TRANSFER 반려 자동 복구", () => {
  beforeEach(() => {
    store.reset();
  });

  test("정상 시나리오 — 후속 작업 없음 → 원본 +이동수량 / 신규 LOT·입고관리 soft delete", async () => {
    const { transfer, newLot, newInbound } = await seedAndApproveTransfer({
      origLotId: "recLOTORIGINAL001",
      origInboundId: "recINBOUNDORIG001",
      origQty: 100,
      이동수량: 50,
    });

    // 승인 직후 상태 확인
    expect(store.get("LOT별 재고", "recLOTORIGINAL001")!.fields.재고수량).toBe(50);
    expect(store.get("입고 관리", "recINBOUNDORIG001")!.fields.잔여수량).toBe(50);
    expect(newLot.fields.재고수량).toBe(50);
    expect(newInbound.fields.잔여수량).toBe(50);

    // 반려 처리
    const { updateApprovalStatus } = await import("@/app/actions/admin/admin");
    const rejectRes = await updateApprovalStatus(
      WORKER_ADMIN.id,
      transfer.id,
      "TRANSFER",
      "반려",
      "테스트 반려",
    );
    expect(rejectRes.success).toBe(true);

    // 원본 복구
    expect(store.get("LOT별 재고", "recLOTORIGINAL001")!.fields.재고수량).toBe(100);
    expect(store.get("입고 관리", "recINBOUNDORIG001")!.fields.잔여수량).toBe(100);

    // 신규 LOT soft delete
    expect(store.get("LOT별 재고", newLot.id)!.fields.재고수량).toBe(0);

    // 신규 입고관리 soft delete
    const newInboundAfter = store.get("입고 관리", newInbound.id)!;
    expect(newInboundAfter.fields.잔여수량).toBe(0);
    expect(newInboundAfter.fields.승인상태).toBe("반려");

    // 재고 이동 레코드 자체는 반려 상태로 PATCH됨
    expect(store.get("재고 이동", transfer.id)!.fields.승인상태).toBe("반려");
  });

  test("검사 (c) 차단 — 신규 LOT에서 활성 출고 발생 시 반려 차단 + 데이터 무변경", async () => {
    const { transfer, newLot, newInbound } = await seedAndApproveTransfer({
      origLotId: "recLOTORIGINAL002",
      origInboundId: "recINBOUNDORIG002",
      origQty: 100,
      이동수량: 50,
    });

    // 신규 LOT(부산냉동)에서 10박스 출고 — 승인 완료 상태로 직접 seed
    const outboundRecord = {
      id: "recOUTBOUNDNEW001",
      fields: {
        출고일: "2026-05-07",
        출고수량: 10,
        판매가: 80000,
        입고관리: [newInbound.id],
        LOT재고레코드ID: newLot.id,
        승인상태: "승인 완료",
        보관처: [STORAGE_BUSAN.id],
        작업자: [WORKER_NORMAL.id],
      },
    };
    store.seed("출고 관리", [outboundRecord]);
    // 신규 LOT/입고관리도 출고 반영 — 재고 50 → 40, 잔여 50 → 40
    store.patch("LOT별 재고", newLot.id, { 재고수량: 40 });
    store.patch("입고 관리", newInbound.id, { 잔여수량: 40 });

    // 반려 시도 → 차단 (검사 (a)가 먼저 잡음 — newLotStock != 이동수량)
    const { updateApprovalStatus } = await import("@/app/actions/admin/admin");
    const rejectRes = await updateApprovalStatus(
      WORKER_ADMIN.id,
      transfer.id,
      "TRANSFER",
      "반려",
      "테스트 반려",
    );

    expect(rejectRes.success).toBe(false);
    expect(rejectRes.message).toMatch(/재고|복구|출고/);

    // 데이터 변화 없음 — 원본/신규 그대로
    expect(store.get("LOT별 재고", "recLOTORIGINAL002")!.fields.재고수량).toBe(50);
    expect(store.get("입고 관리", "recINBOUNDORIG002")!.fields.잔여수량).toBe(50);
    expect(store.get("LOT별 재고", newLot.id)!.fields.재고수량).toBe(40);
    expect(store.get("입고 관리", newInbound.id)!.fields.잔여수량).toBe(40);
    // 재고 이동 레코드 상태는 PATCH 되지 않음 — 여전히 승인 완료
    expect(store.get("재고 이동", transfer.id)!.fields.승인상태).toBe("승인 완료");
  });

  test("검사 (b) 차단 — 신규 LOT을 원본으로 한 활성 재이동 존재 시 반려 차단", async () => {
    const { transfer, newLot } = await seedAndApproveTransfer({
      origLotId: "recLOTORIGINAL003",
      origInboundId: "recINBOUNDORIG003",
      origQty: 100,
      이동수량: 50,
    });

    // 신규 LOT(0181 격)을 원본으로 한 두 번째 이동 신청(승인 대기) seed
    const secondTransfer = {
      id: "recTRANSFER2NDXX1",
      fields: {
        이동일: "2026-05-08",
        이동수량: 20,
        "원본 LOT번호": [newLot.id],
        "이동 전 보관처": [STORAGE_BUSAN.id],
        "이동 후 보관처": [STORAGE_HANRIM.id],
        작업자: [WORKER_NORMAL.id],
        승인상태: "승인 대기",
      },
    };
    store.seed("재고 이동", [secondTransfer]);

    // 첫 이동 반려 시도 → 차단 (검사 (b))
    const { updateApprovalStatus } = await import("@/app/actions/admin/admin");
    const rejectRes = await updateApprovalStatus(
      WORKER_ADMIN.id,
      transfer.id,
      "TRANSFER",
      "반려",
      "테스트 반려",
    );

    expect(rejectRes.success).toBe(false);
    expect(rejectRes.message).toMatch(/이동|복구/);

    // 데이터 변화 없음
    expect(store.get("LOT별 재고", "recLOTORIGINAL003")!.fields.재고수량).toBe(50);
    expect(store.get("LOT별 재고", newLot.id)!.fields.재고수량).toBe(50);
    expect(store.get("재고 이동", transfer.id)!.fields.승인상태).toBe("승인 완료");
  });
});
