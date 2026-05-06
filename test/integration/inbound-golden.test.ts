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
 * 시나리오 1 — 입고 골든패스
 *
 * 흐름:
 *   1. 일반 작업자가 입고 신청 (createInventoryRecord)
 *      → 입고 관리 레코드 생성 (승인 대기, LOT번호 자동 채번)
 *      → LOT별 재고 레코드 생성 (재고수량=0 예약)
 *      → 품목마스터에 LOT 연결
 *   2. 관리자가 승인 (updateApprovalStatus INBOUND, "승인 완료")
 *      → LOT별 재고.재고수량을 0에서 입고수량으로 PATCH
 *      → 보관처 비용(냉장료/입출고비/노조비) PATCH
 *      → 입고증 PDF 생성 (모킹: Buffer만)
 *      → 입고 관리.승인상태 = "승인 완료" PATCH
 */

describe("입고 골든패스", () => {
  test("신청 → 승인 → LOT 재고 반영", async () => {
    // ── 1. 마스터 데이터 seed ──
    store.seed("작업자", ALL_MASTERS.workers);
    store.seed("품목마스터", ALL_MASTERS.products);
    store.seed("보관처 마스터", ALL_MASTERS.storages);
    store.seed("보관처 비용 이력", ALL_MASTERS.storageCosts);

    // ── 2. 입고 신청 ──
    const { createInventoryRecord } = await import(
      "@/app/actions/inventory/inbound"
    );
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

    // 입고 관리 레코드 확인
    const inboundRecords = store.list("입고 관리");
    expect(inboundRecords).toHaveLength(1);
    const inbound = inboundRecords[0];
    expect(inbound.fields.승인상태).toBe("승인 대기");
    expect(inbound.fields.입고수량).toBe(100);
    expect(inbound.fields.수매가).toBe(50000);
    const lotNumberOnInbound = String(inbound.fields.LOT번호 ?? "");
    // LOT번호 형식: YYMMDD-품목코드-규격-미수-일련번호 (CLAUDE.md 예: 260417-MC1-11-26-0001)
    expect(lotNumberOnInbound).toMatch(/^\d{6}-MC1-11-26-\d{4}$/);

    // LOT별 재고 — 신청 시점엔 재고수량=0
    const lotsAfterRequest = store.list("LOT별 재고");
    expect(lotsAfterRequest).toHaveLength(1);
    const lot = lotsAfterRequest[0];
    expect(lot.fields.재고수량).toBe(0);
    expect(lot.fields.LOT번호).toBe(lotNumberOnInbound);
    expect(lot.fields["입고수량(BOX)"]).toBe(100);

    // ── 3. 관리자 승인 ──
    const { updateApprovalStatus } = await import(
      "@/app/actions/admin/admin"
    );
    const approvalResult = await updateApprovalStatus(
      WORKER_ADMIN.id,
      inbound.id,
      "INBOUND",
      "승인 완료",
    );

    expect(approvalResult.success).toBe(true);

    // ── 4. 검증: LOT 재고가 입고수량으로 채워졌는지 ──
    const lotAfterApproval = store.get("LOT별 재고", lot.id);
    expect(lotAfterApproval).not.toBeNull();
    expect(lotAfterApproval!.fields.재고수량).toBe(100);

    // 보관처 비용 이력에서 가져온 값들이 PATCH 됐는지
    expect(lotAfterApproval!.fields.냉장료단가).toBe(1500);
    expect(lotAfterApproval!.fields.입출고비).toBe(500);
    expect(lotAfterApproval!.fields.노조비).toBe(200);

    // 입고자 링크가 신청 작업자로 설정됐는지
    expect(lotAfterApproval!.fields.입고자).toEqual([WORKER_NORMAL.id]);

    // 입고 관리 상태 PATCH 확인
    const inboundAfterApproval = store.get("입고 관리", inbound.id);
    expect(inboundAfterApproval!.fields.승인상태).toBe("승인 완료");

    // 입고증 PDF URL이 저장됐는지 (Vercel Blob mock URL)
    expect(String(inboundAfterApproval!.fields.입고증URL ?? "")).toMatch(
      /^https:\/\/mock-blob\.vercel-storage\.com\//,
    );
  });
});
