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
 * 시나리오 2 — 출고 골든패스
 *
 * 흐름:
 *   1. 이미 승인된 입고 + 재고 100박스 LOT 준비 (seed)
 *   2. 작업자가 출고 신청 (createOutboundRecord) — 출고수량 30박스
 *      → 출고 관리 레코드 생성 (승인 대기)
 *      → 잔여수량/LOT재고는 그대로 (승인 시점에 차감)
 *   3. 관리자가 승인 (updateApprovalStatus OUTBOUND, "승인 완료")
 *      → 입고 관리.잔여수량 100 → 70
 *      → LOT별 재고.재고수량 100 → 70
 *      → 출고시점 비용 7개 필드 PATCH (단가/냉장료/입출고비/노조비/판매원가/판매금액/손익)
 *      → 출고 관리.승인상태 = "승인 완료" + 출고증 PDF URL
 */

describe("출고 골든패스", () => {
  test("출고 신청 → 승인 → 잔여수량/LOT 재고 차감 + 출고시점 비용 저장", async () => {
    // ── 1. 마스터 + 기존 입고/LOT seed ──
    store.seed("작업자", ALL_MASTERS.workers);
    store.seed("품목마스터", ALL_MASTERS.products);
    store.seed("보관처 마스터", ALL_MASTERS.storages);
    store.seed("보관처 비용 이력", ALL_MASTERS.storageCosts);

    const inbound = makeApprovedInboundRecord({
      id: "recINBOUNDAPPROVED",
      lotNumber: "260415-MC1-11-26-0001",
      qty: 100,
      remaining: 100,
      purchasePrice: 50000,
    });
    const lot = makeInStockLot({
      id: "recLOTINSTOCK001",
      lotNumber: "260415-MC1-11-26-0001",
      stockQty: 100,
      inboundRecordId: inbound.id,
      purchasePrice: 50000,
    });
    store.seed("입고 관리", [inbound]);
    store.seed("LOT별 재고", [lot]);

    // ── 2. 출고 신청 ──
    const { createOutboundRecord } = await import(
      "@/app/actions/inventory/outbound"
    );
    const outboundResult = await createOutboundRecord({
      workerRecordId: WORKER_NORMAL.id,
      lotRecordId: lot.id,
      inboundRecordId: inbound.id,
      quantity: 30,
      date: "2026-05-06",
      seller: "○○수산",
      salePrice: 55000,
    });

    expect(outboundResult.success).toBe(true);

    // 출고 관리 레코드 확인 (승인 대기)
    const outboundRecords = store.list("출고 관리");
    expect(outboundRecords).toHaveLength(1);
    const outbound = outboundRecords[0];
    expect(outbound.fields.승인상태).toBe("승인 대기");
    expect(outbound.fields.출고수량).toBe(30);
    expect(outbound.fields.판매처).toBe("○○수산");
    expect(outbound.fields.LOT재고레코드ID).toBe(lot.id);

    // 신청 단계에선 잔여수량 / LOT재고 변경 X
    expect(store.get("입고 관리", inbound.id)!.fields.잔여수량).toBe(100);
    expect(store.get("LOT별 재고", lot.id)!.fields.재고수량).toBe(100);

    // ── 3. 관리자 승인 ──
    const { updateApprovalStatus } = await import(
      "@/app/actions/admin/admin"
    );
    const approvalResult = await updateApprovalStatus(
      WORKER_ADMIN.id,
      outbound.id,
      "OUTBOUND",
      "승인 완료",
    );

    expect(approvalResult.success).toBe(true);

    // ── 4. 검증: 잔여수량 / LOT재고 차감 ──
    expect(store.get("입고 관리", inbound.id)!.fields.잔여수량).toBe(70);
    expect(store.get("LOT별 재고", lot.id)!.fields.재고수량).toBe(70);

    // 출고시점 비용 7개 필드 PATCH
    const outAfter = store.get("출고 관리", outbound.id)!;
    expect(outAfter.fields.승인상태).toBe("승인 완료");
    expect(Number(outAfter.fields["출고시점 단가"])).toBeGreaterThan(0);
    expect(outAfter.fields["출고시점 냉장료"]).toBeDefined();
    expect(outAfter.fields["출고시점 입출고비"]).toBeDefined();
    expect(outAfter.fields["출고시점 노조비"]).toBeDefined();
    expect(Number(outAfter.fields["출고시점 판매원가"])).toBeGreaterThan(0);
    expect(outAfter.fields["출고시점 판매금액"]).toBeDefined();
    expect(outAfter.fields["출고시점 손익"]).toBeDefined();

    // 출고증 PDF URL
    expect(String(outAfter.fields.출고증URL ?? "")).toMatch(
      /^https:\/\/mock-blob\.vercel-storage\.com\//,
    );
  });
});
