import { describe, expect, test } from "vitest";
import { store } from "./airtable-store";
import {
  ALL_MASTERS,
  WORKER_NORMAL,
  makeApprovedInboundRecord,
  makeInStockLot,
} from "./fixtures";

/**
 * 출고 cart 일괄 신청 정책 (B안 — 부분 성공 허용)
 *
 * 결정 노트: obsidian-vault/40_결정기록/출고이동_카트_UX_통일.md
 *
 * 정책: cart의 여러 LOT 중 일부가 실패해도 성공한 건은 서버에 기록되고
 * 나머지 LOT 신청도 계속되어야 한다. 사용자에게는 성공/실패가 분리된
 * 결과 화면이 표시된다.
 *
 * ⚠ 통합 테스트 한계
 *   handleSubmitAll 자체는 client 컴포넌트(app/inventory/outbound/page.tsx)의
 *   인라인 for loop이므로 통합 테스트로 직접 검증할 수 없다. 본 테스트는
 *   "client가 cart를 끝까지 순회한다고 가정할 때" 서버 측 동작이 B안 정책에
 *   부합함을 검증하는 정합성 안전망 역할을 한다.
 *
 *   1단계(현재): server actions 시퀀스 정합성 검증 — 통과해야 정상
 *   2단계(후속): client handleSubmitAll을 status의 handleBulkOutbound 패턴으로
 *               정렬. 본 테스트는 회귀 방지 안전망으로 그대로 통과해야 함.
 */

type LotSpec = {
  id: string;
  inboundId: string;
  lotNumber: string;
  remaining: number; // 잔여수량 — 이 값이 quantity보다 작으면 자연 실패
};

function seedMasters(): void {
  store.seed("작업자", ALL_MASTERS.workers);
  store.seed("품목마스터", ALL_MASTERS.products);
  store.seed("보관처 마스터", ALL_MASTERS.storages);
  store.seed("보관처 비용 이력", ALL_MASTERS.storageCosts);
}

function seedLotsForBulk(specs: LotSpec[]): void {
  for (const s of specs) {
    const inbound = makeApprovedInboundRecord({
      id: s.inboundId,
      lotNumber: s.lotNumber,
      qty: 100,
      remaining: s.remaining,
    });
    const lot = makeInStockLot({
      id: s.id,
      lotNumber: s.lotNumber,
      stockQty: s.remaining,
      inboundRecordId: inbound.id,
    });
    store.seed("입고 관리", [inbound]);
    store.seed("LOT별 재고", [lot]);
  }
}

async function submitOutbound(
  spec: LotSpec,
  qty: number,
): Promise<{ success: boolean; error?: string }> {
  const { createOutboundRecord } = await import(
    "@/app/actions/inventory/outbound"
  );
  return createOutboundRecord({
    workerRecordId: WORKER_NORMAL.id,
    lotRecordId: spec.id,
    inboundRecordId: spec.inboundId,
    quantity: qty,
    date: "2026-05-12",
    seller: "○○수산",
    salePrice: 55000,
  });
}

describe("outbound cart 일괄 신청 정책 (B안)", () => {
  test("시나리오 A — 5건 중 3번째 실패: 1,2,4,5는 서버에 기록 (B안 부분 성공)", async () => {
    seedMasters();
    const specs: LotSpec[] = [
      { id: "recLOTBULK001", inboundId: "recINBULK001", lotNumber: "260515-MC1-11-26-0001", remaining: 100 },
      { id: "recLOTBULK002", inboundId: "recINBULK002", lotNumber: "260515-MC1-11-26-0002", remaining: 100 },
      { id: "recLOTBULK003", inboundId: "recINBULK003", lotNumber: "260515-MC1-11-26-0003", remaining: 10 }, // 부족 → 실패
      { id: "recLOTBULK004", inboundId: "recINBULK004", lotNumber: "260515-MC1-11-26-0004", remaining: 100 },
      { id: "recLOTBULK005", inboundId: "recINBULK005", lotNumber: "260515-MC1-11-26-0005", remaining: 100 },
    ];
    seedLotsForBulk(specs);

    // 각 LOT 30박스 신청 — 3번째만 잔여 10 < 30 → 자연 실패
    const results: { success: boolean; error?: string }[] = [];
    for (const s of specs) {
      results.push(await submitOutbound(s, 30));
    }

    // 1, 2, 4, 5 성공 / 3 실패
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(true);
    expect(results[2].success).toBe(false);
    expect(results[2].error).toMatch(/잔여수량|잔여/);
    expect(results[3].success).toBe(true);
    expect(results[4].success).toBe(true);

    // 서버에는 4건의 출고 관리 레코드 생성 (3번째 LOT는 미생성)
    const outboundRecords = store.list("출고 관리");
    expect(outboundRecords).toHaveLength(4);

    // 생성된 레코드의 LOT재고레코드ID가 1, 2, 4, 5에 해당
    const createdLotIds = outboundRecords
      .map((r) => String(r.fields.LOT재고레코드ID))
      .sort();
    expect(createdLotIds).toEqual([
      "recLOTBULK001",
      "recLOTBULK002",
      "recLOTBULK004",
      "recLOTBULK005",
    ]);
  });

  test("시나리오 B — 5건 모두 성공: 5건 모두 서버에 기록", async () => {
    seedMasters();
    const specs: LotSpec[] = [1, 2, 3, 4, 5].map((i) => ({
      id: `recLOTBSUC00${i}`,
      inboundId: `recINBSUC00${i}`,
      lotNumber: `260516-MC1-11-26-000${i}`,
      remaining: 100,
    }));
    seedLotsForBulk(specs);

    const results: { success: boolean; error?: string }[] = [];
    for (const s of specs) {
      results.push(await submitOutbound(s, 30));
    }

    expect(results.every((r) => r.success)).toBe(true);

    // 5건 모두 출고 관리 레코드 생성 (승인 대기)
    const outboundRecords = store.list("출고 관리");
    expect(outboundRecords).toHaveLength(5);
    for (const rec of outboundRecords) {
      expect(rec.fields.승인상태).toBe("승인 대기");
    }

    // 잔여수량은 그대로 — 실제 차감은 승인 시점에 admin.ts에서 처리
    for (const s of specs) {
      expect(store.get("입고 관리", s.inboundId)!.fields.잔여수량).toBe(100);
    }
  });

  test("시나리오 C — 5건 모두 실패: 어느 것도 서버에 기록 안 됨", async () => {
    seedMasters();
    const specs: LotSpec[] = [1, 2, 3, 4, 5].map((i) => ({
      id: `recLOTBFAIL00${i}`,
      inboundId: `recINBFAIL00${i}`,
      lotNumber: `260517-MC1-11-26-000${i}`,
      remaining: 10, // 모두 부족
    }));
    seedLotsForBulk(specs);

    const results: { success: boolean; error?: string }[] = [];
    for (const s of specs) {
      results.push(await submitOutbound(s, 30));
    }

    // 모두 실패 + 잔여수량 부족 메시지
    expect(results.every((r) => !r.success)).toBe(true);
    for (const r of results) {
      expect(r.error).toMatch(/잔여수량|잔여/);
    }

    // 서버에 출고 관리 레코드 0건
    expect(store.list("출고 관리")).toHaveLength(0);
  });

  test("시나리오 D — 부분 실패 후 실패 N건 재시도: 1차 성공 LOT 중복 없이 총 5건", async () => {
    seedMasters();
    // 1차: 5건 중 LOT 1, 3, 5가 잔여 부족 (3건 실패 예상)
    const specs: LotSpec[] = [
      { id: "recLOTBRTY001", inboundId: "recINBRTY001", lotNumber: "260518-MC1-11-26-0001", remaining: 10 },
      { id: "recLOTBRTY002", inboundId: "recINBRTY002", lotNumber: "260518-MC1-11-26-0002", remaining: 100 },
      { id: "recLOTBRTY003", inboundId: "recINBRTY003", lotNumber: "260518-MC1-11-26-0003", remaining: 10 },
      { id: "recLOTBRTY004", inboundId: "recINBRTY004", lotNumber: "260518-MC1-11-26-0004", remaining: 100 },
      { id: "recLOTBRTY005", inboundId: "recINBRTY005", lotNumber: "260518-MC1-11-26-0005", remaining: 10 },
    ];
    seedLotsForBulk(specs);

    // 1차 cart 전체 순회
    const firstResults: { success: boolean; error?: string }[] = [];
    for (const s of specs) {
      firstResults.push(await submitOutbound(s, 30));
    }
    const firstFailIndexes = firstResults
      .map((r, i) => (r.success ? -1 : i))
      .filter((i) => i >= 0);
    expect(firstFailIndexes).toEqual([0, 2, 4]);
    expect(store.list("출고 관리")).toHaveLength(2);

    // 실패 LOT의 잔여수량 보충 (실제 운영에선 추가 입고 또는 LOT 합산 후 재시도)
    for (const idx of firstFailIndexes) {
      store.patch("입고 관리", specs[idx].inboundId, { 잔여수량: 100 });
    }

    // 2차: 실패한 LOT만 재시도 (status의 retryFailedOutbound 패턴 시뮬레이션)
    const retryResults: { success: boolean; error?: string }[] = [];
    for (const idx of firstFailIndexes) {
      retryResults.push(await submitOutbound(specs[idx], 30));
    }
    expect(retryResults.every((r) => r.success)).toBe(true);

    // 총 5건, 각 LOT가 정확히 1번씩 신청됨 (중복 없음)
    const allOutbound = store.list("출고 관리");
    expect(allOutbound).toHaveLength(5);

    const lotIdCounts = new Map<string, number>();
    for (const rec of allOutbound) {
      const lotId = String(rec.fields.LOT재고레코드ID);
      lotIdCounts.set(lotId, (lotIdCounts.get(lotId) ?? 0) + 1);
    }
    for (const s of specs) {
      expect(lotIdCounts.get(s.id)).toBe(1);
    }
  });
});
