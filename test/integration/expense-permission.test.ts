import { describe, expect, test } from "vitest";
import { store } from "./airtable-store";
import { ALL_MASTERS, WORKER_ADMIN, WORKER_MASTER, WORKER_NORMAL } from "./fixtures";

/**
 * 시나리오 8/9/10 — 100만원 권한 분기 (서버 재검증)
 *
 * 정책 (admin.ts updateApprovalStatus):
 *   - 100만원 미만: ADMIN/MASTER 모두 즉시 "승인 완료" 가능
 *   - 100만원 이상: ADMIN이 "승인 완료" 시도하면 거부 (FORBIDDEN)
 *   - 100만원 이상: ADMIN은 "최종 승인 대기"로만, MASTER가 그 후 "승인 완료"
 *   - 100만원 이상 + MASTER: 즉시 "승인 완료" 가능 (생략)
 *
 * 클라이언트 우회 시도해도 서버에서 admin.role을 Airtable로 직접 조회해 차단.
 */

async function createExpense(
  applicantRecordId: string,
  amount: number,
  title = "테스트 지출",
): Promise<string> {
  const { createExpenseRecord } = await import(
    "@/app/actions/expense/expense"
  );
  const result = await createExpenseRecord({
    applicantRecordId,
    date: "2026-05-06",
    title,
    amount,
    isCorpCard: true,
  });
  expect(result.success).toBe(true);
  return store.list("지출결의")[0].id;
}

describe("시나리오 8 — ADMIN 100만원 미만 즉시 승인", () => {
  test("ADMIN이 50만원 지출 → 즉시 승인 완료", async () => {
    store.seed("작업자", ALL_MASTERS.workers);
    const expenseId = await createExpense(WORKER_NORMAL.id, 500_000);

    const { updateApprovalStatus } = await import("@/app/actions/admin/admin");
    const result = await updateApprovalStatus(
      WORKER_ADMIN.id,
      expenseId,
      "EXPENSE",
      "승인 완료",
    );

    expect(result.success).toBe(true);
    expect(store.get("지출결의", expenseId)!.fields.승인상태).toBe("승인 완료");
  });
});

describe("시나리오 9 — ADMIN 100만원 이상 차단 (FORBIDDEN)", () => {
  test("ADMIN이 200만원 지출을 즉시 승인 시도 → 거부", async () => {
    store.seed("작업자", ALL_MASTERS.workers);
    const expenseId = await createExpense(WORKER_NORMAL.id, 2_000_000);

    const { updateApprovalStatus } = await import("@/app/actions/admin/admin");
    const result = await updateApprovalStatus(
      WORKER_ADMIN.id,
      expenseId,
      "EXPENSE",
      "승인 완료",
    );

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/MASTER/);
    // 상태는 신청 시점 그대로 — "승인 대기"
    expect(store.get("지출결의", expenseId)!.fields.승인상태).toBe("승인 대기");
  });

  test("정확히 100만원 → ADMIN 즉시 승인 차단 (>= 1,000,000)", async () => {
    store.seed("작업자", ALL_MASTERS.workers);
    const expenseId = await createExpense(WORKER_NORMAL.id, 1_000_000);

    const { updateApprovalStatus } = await import("@/app/actions/admin/admin");
    const result = await updateApprovalStatus(
      WORKER_ADMIN.id,
      expenseId,
      "EXPENSE",
      "승인 완료",
    );
    expect(result.success).toBe(false);
  });

  test("ADMIN이 200만원 지출을 '최종 승인 대기'로 → 통과 (1차 결재)", async () => {
    store.seed("작업자", ALL_MASTERS.workers);
    const expenseId = await createExpense(WORKER_NORMAL.id, 2_000_000);

    const { updateApprovalStatus } = await import("@/app/actions/admin/admin");
    const result = await updateApprovalStatus(
      WORKER_ADMIN.id,
      expenseId,
      "EXPENSE",
      "최종 승인 대기",
    );
    expect(result.success).toBe(true);
    expect(store.get("지출결의", expenseId)!.fields.승인상태).toBe(
      "최종 승인 대기",
    );
  });
});

describe("시나리오 10 — MASTER 2단계 승인", () => {
  test("MASTER가 200만원 지출을 즉시 '승인 완료' → 통과", async () => {
    store.seed("작업자", ALL_MASTERS.workers);
    const expenseId = await createExpense(WORKER_NORMAL.id, 2_000_000);

    const { updateApprovalStatus } = await import("@/app/actions/admin/admin");
    const result = await updateApprovalStatus(
      WORKER_MASTER.id,
      expenseId,
      "EXPENSE",
      "승인 완료",
    );
    expect(result.success).toBe(true);
    expect(store.get("지출결의", expenseId)!.fields.승인상태).toBe("승인 완료");
  });

  test("ADMIN '최종 승인 대기' → MASTER '승인 완료' 흐름", async () => {
    store.seed("작업자", ALL_MASTERS.workers);
    const expenseId = await createExpense(WORKER_NORMAL.id, 2_000_000);

    const { updateApprovalStatus } = await import("@/app/actions/admin/admin");

    // 1차: ADMIN이 최종 승인 대기로
    await updateApprovalStatus(
      WORKER_ADMIN.id,
      expenseId,
      "EXPENSE",
      "최종 승인 대기",
    );
    expect(store.get("지출결의", expenseId)!.fields.승인상태).toBe(
      "최종 승인 대기",
    );

    // 2차: 같은 건을 ADMIN이 승인 완료 시도 → 거부
    const blockedByAdmin = await updateApprovalStatus(
      WORKER_ADMIN.id,
      expenseId,
      "EXPENSE",
      "승인 완료",
    );
    expect(blockedByAdmin.success).toBe(false);

    // 3차: MASTER가 승인 완료
    const finalResult = await updateApprovalStatus(
      WORKER_MASTER.id,
      expenseId,
      "EXPENSE",
      "승인 완료",
    );
    expect(finalResult.success).toBe(true);
    expect(store.get("지출결의", expenseId)!.fields.승인상태).toBe("승인 완료");
  });
});
