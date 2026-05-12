import { describe, expect, test, vi } from "vitest";
import { store } from "./airtable-store";
import { injectFault } from "./fetch-mock";
import {
  ALL_MASTERS,
  WORKER_ADMIN,
  WORKER_NORMAL,
  makeApprovedInboundRecord,
  makeInStockLot,
} from "./fixtures";

/**
 * 시나리오 E4 — 출고 반려 시 LOT 재고 복구 실패 → 입고 보상 트랜잭션
 *
 * 정책 (admin.ts restoreStockOnOutboundReject):
 *   - 1단계: 입고관리.잔여수량 +outQty (성공 시 inboundRestored=true)
 *   - 2단계: LOT별 재고.재고수량 +outQty (실패 케이스)
 *   - 2단계 실패 & inboundRestored=true → 보상 트랜잭션으로 입고 -outQty 원복
 *   - 양쪽 모두 "차감된 상태"로 일치 유지 + [INTEGRITY-ALERT] 로그
 *   - 사용자는 반려 재시도로 복구 진행 가능
 */

async function setupApprovedOutbound() {
  store.seed("작업자", ALL_MASTERS.workers);
  store.seed("품목마스터", ALL_MASTERS.products);
  store.seed("보관처 마스터", ALL_MASTERS.storages);
  store.seed("보관처 비용 이력", ALL_MASTERS.storageCosts);

  const inbound = makeApprovedInboundRecord({
    id: "recINBOUNDE4A0001",
    lotNumber: "260415-MC1-11-26-9101",
    qty: 100,
    remaining: 100,
  });
  const lot = makeInStockLot({
    id: "recLOTE4INSTOCK01",
    lotNumber: "260415-MC1-11-26-9101",
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
    date: "2026-05-12",
    seller: "○○수산",
    salePrice: 55000,
  });
  const outbound = store.list("출고 관리")[0];

  // 승인 처리 → 차감 상태로 만듦
  await updateApprovalStatus(WORKER_ADMIN.id, outbound.id, "OUTBOUND", "승인 완료");
  expect(store.get("입고 관리", inbound.id)!.fields.잔여수량).toBe(70);
  expect(store.get("LOT별 재고", lot.id)!.fields.재고수량).toBe(70);

  return { inbound, lot, outbound, updateApprovalStatus };
}

describe("시나리오 E4 — 출고 반려 시 LOT 복구 실패 보상", () => {
  test("LOT 재고 PATCH 실패 → 입고 잔여수량 보상 원복 + 양쪽 일치", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { inbound, lot, outbound, updateApprovalStatus } =
      await setupApprovedOutbound();

    // 반려 시 LOT 재고수량 PATCH 실패 주입
    injectFault({
      table: "LOT별 재고",
      method: "PATCH",
      fieldKey: "재고수량",
    });

    const r = await updateApprovalStatus(
      WORKER_ADMIN.id,
      outbound.id,
      "OUTBOUND",
      "반려",
      "테스트용 반려",
    );

    // 반려 실패
    expect(r.success).toBe(false);
    expect(r.message ?? "").toContain("LOT 재고 복구");

    // 입고 잔여수량 — 보상으로 원복(70). NOT 100.
    expect(store.get("입고 관리", inbound.id)!.fields.잔여수량).toBe(70);
    // LOT 재고수량 — 복구 실패로 70 그대로 유지 (NOT 100)
    expect(store.get("LOT별 재고", lot.id)!.fields.재고수량).toBe(70);

    // 출고 관리는 여전히 승인 완료 상태 (반려 PATCH 미수행)
    const outAfter = store.get("출고 관리", outbound.id)!;
    expect(outAfter.fields.승인상태).toBe("승인 완료");
    // 출고시점 비용 필드는 그대로 (clearOk 이전 단계에서 return)
    expect(Number(outAfter.fields["출고시점 판매원가"])).toBeGreaterThan(0);

    // [INTEGRITY-ALERT] 로그 검증
    const alertCalls = errorSpy.mock.calls.filter((args) =>
      args.some(
        (a) =>
          typeof a === "string" &&
          a.includes("[INTEGRITY-ALERT]") &&
          a.includes("LOT 재고 복구 PATCH 실패"),
      ),
    );
    expect(alertCalls.length).toBeGreaterThanOrEqual(1);
    // 보상 결과 객체에 compensationOk:true 포함
    const compensationLog = errorSpy.mock.calls.find((args) =>
      args.some(
        (a) =>
          a !== null &&
          typeof a === "object" &&
          (a as Record<string, unknown>).compensationOk === true,
      ),
    );
    expect(compensationLog).toBeDefined();

    errorSpy.mockRestore();
  });

  test("실패 후 반려 재시도 — 정상 복구 가능", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { inbound, lot, outbound, updateApprovalStatus } =
      await setupApprovedOutbound();

    // 1차 반려: LOT PATCH 실패
    injectFault({
      table: "LOT별 재고",
      method: "PATCH",
      fieldKey: "재고수량",
    });
    const r1 = await updateApprovalStatus(
      WORKER_ADMIN.id,
      outbound.id,
      "OUTBOUND",
      "반려",
    );
    expect(r1.success).toBe(false);
    // 양쪽 차감된 상태로 일치
    expect(store.get("입고 관리", inbound.id)!.fields.잔여수량).toBe(70);
    expect(store.get("LOT별 재고", lot.id)!.fields.재고수량).toBe(70);

    // 2차 반려: fault 소진 → 정상 복구
    const r2 = await updateApprovalStatus(
      WORKER_ADMIN.id,
      outbound.id,
      "OUTBOUND",
      "반려",
      "재시도",
    );
    expect(r2.success).toBe(true);

    // 정상 복구: 양쪽 100
    expect(store.get("입고 관리", inbound.id)!.fields.잔여수량).toBe(100);
    expect(store.get("LOT별 재고", lot.id)!.fields.재고수량).toBe(100);
    // 출고시점 비용 7필드 null
    const outAfter = store.get("출고 관리", outbound.id)!;
    expect(outAfter.fields.승인상태).toBe("반려");
    expect(outAfter.fields["출고시점 판매원가"]).toBeNull();

    errorSpy.mockRestore();
  });
});
