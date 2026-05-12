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
 * 시나리오 E2 — 출고 승인 race 감지 모니터링
 *
 * 정책 (admin.ts deductStockOnOutboundApproval):
 *   - 입고관리 PATCH / LOT 재고 PATCH 직후 재조회 → expected vs observed 비교
 *   - 모든 승인은 [OUTBOUND-RACE-MON] prefix 로그 emit (mismatch 여부 포함)
 *   - 불일치 감지 시 [INTEGRITY-ALERT] prefix 추가 — 운영자가 grep 추적
 *   - mutex 미도입: 모든 race를 막진 못함. 운영 관측용 가드레일.
 */

function getMonLogs(spy: ReturnType<typeof vi.spyOn>): Array<{
  prefix: string;
  detail: Record<string, unknown>;
}> {
  const logs: Array<{ prefix: string; detail: Record<string, unknown> }> = [];
  for (const call of spy.mock.calls) {
    const first = call[0];
    if (typeof first !== "string" || !first.includes("[OUTBOUND-RACE-MON]")) {
      continue;
    }
    const detail = (call[1] ?? {}) as Record<string, unknown>;
    logs.push({ prefix: first, detail });
  }
  return logs;
}

async function seedAndCreateOutbound(opts: {
  inboundId?: string;
  lotId?: string;
  qty?: number;
}) {
  const inbound = makeApprovedInboundRecord({
    id: opts.inboundId ?? "recINBOUNDE2A0001",
    lotNumber: "260415-MC1-11-26-9201",
    qty: 100,
    remaining: 100,
  });
  const lot = makeInStockLot({
    id: opts.lotId ?? "recLOTE2INSTOCK01",
    lotNumber: "260415-MC1-11-26-9201",
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
    quantity: opts.qty ?? 30,
    date: "2026-05-12",
    seller: "○○수산",
    salePrice: 55000,
  });
  const outbound = store
    .list("출고 관리")
    .find((r) => Array.isArray(r.fields.LOT번호) && (r.fields.LOT번호 as unknown[])[0] === inbound.id)!;
  return { inbound, lot, outbound };
}

describe("시나리오 E2 — 출고 승인 race 감지 모니터링", () => {
  test("정상 승인 — inbound/lot 모니터링 로그 mismatch:false 두 건", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    store.seed("작업자", ALL_MASTERS.workers);
    store.seed("품목마스터", ALL_MASTERS.products);
    store.seed("보관처 마스터", ALL_MASTERS.storages);
    store.seed("보관처 비용 이력", ALL_MASTERS.storageCosts);

    const { inbound, lot, outbound } = await seedAndCreateOutbound({});
    const { updateApprovalStatus } = await import("@/app/actions/admin/admin");

    const r = await updateApprovalStatus(
      WORKER_ADMIN.id,
      outbound.id,
      "OUTBOUND",
      "승인 완료",
    );
    expect(r.success).toBe(true);

    const monLogs = getMonLogs(errorSpy);
    // 모니터링은 inbound 1건 + lot 1건 = 2건
    expect(monLogs).toHaveLength(2);

    const inboundLog = monLogs.find((l) =>
      l.prefix.startsWith("[OUTBOUND-RACE-MON] inbound"),
    )!;
    expect(inboundLog).toBeDefined();
    expect(inboundLog.detail).toMatchObject({
      inboundRecordId: inbound.id,
      before: 100,
      expected: 70,
      observed: 70,
      outQty: 30,
      mismatch: false,
    });

    const lotLog = monLogs.find((l) =>
      l.prefix.startsWith("[OUTBOUND-RACE-MON] lot"),
    )!;
    expect(lotLog).toBeDefined();
    expect(lotLog.detail).toMatchObject({
      lotInventoryRecordId: lot.id,
      before: 100,
      expected: 70,
      observed: 70,
      outQty: 30,
      mismatch: false,
    });

    // 정상 케이스 — [INTEGRITY-ALERT] 없음
    const alertLogs = monLogs.filter((l) => l.prefix.includes("[INTEGRITY-ALERT]"));
    expect(alertLogs).toHaveLength(0);

    errorSpy.mockRestore();
  });

  test("LOT 재고 PATCH 실패 시 → mismatch 감지 + INTEGRITY-ALERT 로그", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    store.seed("작업자", ALL_MASTERS.workers);
    store.seed("품목마스터", ALL_MASTERS.products);
    store.seed("보관처 마스터", ALL_MASTERS.storages);
    store.seed("보관처 비용 이력", ALL_MASTERS.storageCosts);

    const { lot, outbound } = await seedAndCreateOutbound({});
    const { updateApprovalStatus } = await import("@/app/actions/admin/admin");

    // LOT 재고 PATCH만 실패시킴 — 현재 코드는 LOT PATCH 반환값을 검사하지 않으므로
    // 함수는 진행되지만 LOT 재고는 변경되지 않은 채로 검증 단계에서 mismatch 발견.
    injectFault({
      table: "LOT별 재고",
      method: "PATCH",
      fieldKey: "재고수량",
    });

    await updateApprovalStatus(
      WORKER_ADMIN.id,
      outbound.id,
      "OUTBOUND",
      "승인 완료",
    );

    // LOT 재고는 변경 안 됨 — fault로 PATCH 차단
    expect(store.get("LOT별 재고", lot.id)!.fields.재고수량).toBe(100);

    const monLogs = getMonLogs(errorSpy);
    const lotAlert = monLogs.find(
      (l) =>
        l.prefix.includes("[INTEGRITY-ALERT]") &&
        l.prefix.includes("LOT 재고수량 race 감지"),
    );
    expect(lotAlert).toBeDefined();
    expect(lotAlert!.detail).toMatchObject({
      before: 100,
      expected: 70,
      observed: 100, // PATCH가 차단되어 변화 없음
      outQty: 30,
      mismatch: true,
    });

    errorSpy.mockRestore();
  });

  test("Promise.all 동시 승인 2건 — 모니터링 로그 4건 emit (per-approval × 2 PATCH)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    store.seed("작업자", ALL_MASTERS.workers);
    store.seed("품목마스터", ALL_MASTERS.products);
    store.seed("보관처 마스터", ALL_MASTERS.storages);
    store.seed("보관처 비용 이력", ALL_MASTERS.storageCosts);

    // 두 개의 독립 출고 (서로 다른 inbound/lot) — Promise.all 동시 승인
    const a = await seedAndCreateOutbound({
      inboundId: "recINBOUNDE2RACE01",
      lotId: "recLOTE2RACE01",
      qty: 30,
    });
    // 두 번째 batch는 fixture id 충돌 방지 위해 별도 시드
    const inbound2 = makeApprovedInboundRecord({
      id: "recINBOUNDE2RACE02",
      lotNumber: "260415-MC1-11-26-9202",
      qty: 100,
      remaining: 100,
    });
    const lot2 = makeInStockLot({
      id: "recLOTE2RACE02",
      lotNumber: "260415-MC1-11-26-9202",
      stockQty: 100,
      inboundRecordId: inbound2.id,
    });
    store.seed("입고 관리", [inbound2]);
    store.seed("LOT별 재고", [lot2]);
    const { createOutboundRecord } = await import(
      "@/app/actions/inventory/outbound"
    );
    await createOutboundRecord({
      workerRecordId: WORKER_NORMAL.id,
      lotRecordId: lot2.id,
      inboundRecordId: inbound2.id,
      quantity: 40,
      date: "2026-05-12",
      seller: "××유통",
      salePrice: 60000,
    });
    const outbound2 = store
      .list("출고 관리")
      .find(
        (r) =>
          Array.isArray(r.fields.LOT번호) &&
          (r.fields.LOT번호 as unknown[])[0] === inbound2.id,
      )!;

    const { updateApprovalStatus } = await import("@/app/actions/admin/admin");

    const [r1, r2] = await Promise.all([
      updateApprovalStatus(WORKER_ADMIN.id, a.outbound.id, "OUTBOUND", "승인 완료"),
      updateApprovalStatus(WORKER_ADMIN.id, outbound2.id, "OUTBOUND", "승인 완료"),
    ]);
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);

    const monLogs = getMonLogs(errorSpy);
    // 각 승인마다 inbound 1 + lot 1 = 2건 → 총 4건
    expect(monLogs).toHaveLength(4);

    // 서로 다른 record 두 쌍 (inbound 2 + lot 2) 모두 mismatch:false
    const inboundLogs = monLogs.filter((l) =>
      l.prefix.startsWith("[OUTBOUND-RACE-MON] inbound"),
    );
    const lotLogs = monLogs.filter((l) =>
      l.prefix.startsWith("[OUTBOUND-RACE-MON] lot"),
    );
    expect(inboundLogs).toHaveLength(2);
    expect(lotLogs).toHaveLength(2);
    for (const l of [...inboundLogs, ...lotLogs]) {
      expect(l.detail.mismatch).toBe(false);
    }

    errorSpy.mockRestore();
  });
});
