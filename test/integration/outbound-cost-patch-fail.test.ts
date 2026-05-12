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
 * 시나리오 E1 — 출고 비용 PATCH 실패 시 재고 원복
 *
 * 정책 (admin.ts deductStockOnOutboundApproval):
 *   - 출고시점 비용 7필드 PATCH 실패 시:
 *     - 입고관리.잔여수량 원복 (currentRemain 그대로)
 *     - LOT별 재고.재고수량 원복 (currentLotQty 그대로)
 *     - [INTEGRITY-ALERT] 로그
 *     - { success: false, message: "..." } 반환
 *   - 멱등 가드(출고시점 판매원가>0)가 동작하지 않는 상태에서 재고를 원복하지
 *     않으면 재승인 시 이중 차감 위험. 이를 방지하는 가드.
 */

async function setupOutboundReady() {
  store.seed("작업자", ALL_MASTERS.workers);
  store.seed("품목마스터", ALL_MASTERS.products);
  store.seed("보관처 마스터", ALL_MASTERS.storages);
  store.seed("보관처 비용 이력", ALL_MASTERS.storageCosts);

  const inbound = makeApprovedInboundRecord({
    id: "recINBOUNDE1A0001",
    lotNumber: "260415-MC1-11-26-9001",
    qty: 100,
    remaining: 100,
  });
  const lot = makeInStockLot({
    id: "recLOTE1INSTOCK01",
    lotNumber: "260415-MC1-11-26-9001",
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

  return { inbound, lot, outbound, updateApprovalStatus };
}

describe("시나리오 E1 — 출고 비용 PATCH 실패 시 재고 원복", () => {
  test("출고시점 비용 PATCH 실패 → 잔여수량/LOT재고 원복 + 승인 실패 반환", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { inbound, lot, outbound, updateApprovalStatus } =
      await setupOutboundReady();

    // 출고 관리.PATCH 중 "출고시점 판매원가" 필드를 포함하는 PATCH만 실패시킴
    // (출고시점 비용 7필드 PATCH가 정확히 이 키를 포함)
    injectFault({
      table: "출고 관리",
      method: "PATCH",
      fieldKey: "출고시점 판매원가",
    });

    const result = await updateApprovalStatus(
      WORKER_ADMIN.id,
      outbound.id,
      "OUTBOUND",
      "승인 완료",
    );

    // 승인은 실패
    expect(result.success).toBe(false);
    expect(result.message ?? "").toContain("출고시점 비용");

    // 잔여수량 원복: 100 (차감 30이 되돌려짐)
    expect(store.get("입고 관리", inbound.id)!.fields.잔여수량).toBe(100);
    // LOT 재고 원복: 100
    expect(store.get("LOT별 재고", lot.id)!.fields.재고수량).toBe(100);

    // 출고 관리는 승인되지 않은 상태 ("승인 대기" 그대로)
    const outAfter = store.get("출고 관리", outbound.id)!;
    expect(outAfter.fields.승인상태).toBe("승인 대기");
    // 출고시점 판매원가는 쓰이지 않음 (PATCH 자체가 fault로 차단됨)
    expect(outAfter.fields["출고시점 판매원가"]).toBeUndefined();

    // [INTEGRITY-ALERT] 로그가 한 번 이상 emit 되었음을 검증
    const alertCalls = errorSpy.mock.calls.filter((args) =>
      args.some(
        (a) =>
          typeof a === "string" &&
          a.includes("[INTEGRITY-ALERT]") &&
          a.includes("출고시점 비용 PATCH 실패"),
      ),
    );
    expect(alertCalls.length).toBeGreaterThanOrEqual(1);

    errorSpy.mockRestore();
  });

  test("PATCH 실패 후 재승인 — 이중 차감 없이 정상 차감", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { inbound, lot, outbound, updateApprovalStatus } =
      await setupOutboundReady();

    // 1차 시도: 실패 주입 → 재고 원복
    injectFault({
      table: "출고 관리",
      method: "PATCH",
      fieldKey: "출고시점 판매원가",
    });
    const r1 = await updateApprovalStatus(
      WORKER_ADMIN.id,
      outbound.id,
      "OUTBOUND",
      "승인 완료",
    );
    expect(r1.success).toBe(false);
    expect(store.get("입고 관리", inbound.id)!.fields.잔여수량).toBe(100);
    expect(store.get("LOT별 재고", lot.id)!.fields.재고수량).toBe(100);

    // 2차 재시도: fault 소진됨 → 정상 승인
    const r2 = await updateApprovalStatus(
      WORKER_ADMIN.id,
      outbound.id,
      "OUTBOUND",
      "승인 완료",
    );
    expect(r2.success).toBe(true);

    // 정상 차감: 잔여 70, LOT 70
    expect(store.get("입고 관리", inbound.id)!.fields.잔여수량).toBe(70);
    expect(store.get("LOT별 재고", lot.id)!.fields.재고수량).toBe(70);
    // 출고시점 판매원가가 양수로 저장됨
    expect(
      Number(store.get("출고 관리", outbound.id)!.fields["출고시점 판매원가"]),
    ).toBeGreaterThan(0);

    errorSpy.mockRestore();
  });
});
