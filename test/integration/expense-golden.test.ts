import { describe, expect, test } from "vitest";
import { store } from "./airtable-store";
import { ALL_MASTERS, WORKER_ADMIN, WORKER_NORMAL } from "./fixtures";

/**
 * 시나리오 4 — 지출결의 골든패스 (100만원 미만 — 즉시 승인)
 *
 * 흐름:
 *   1. 작업자가 50만원 지출 신청 (createExpenseRecord)
 *      → 지출결의 레코드 생성 (승인 대기, 신청자 link)
 *   2. 관리자 승인 (updateApprovalStatus EXPENSE, "승인 완료")
 *      → 100만원 미만이므로 즉시 "승인 완료"
 *      → 지출결의서 PDF 생성 + URL PATCH
 *      → 지출결의.승인상태 = "승인 완료"
 */

describe("지출결의 골든패스", () => {
  test("100만원 미만 신청 → 즉시 승인 → PDF 저장", async () => {
    store.seed("작업자", ALL_MASTERS.workers);

    // ── 1. 지출 신청 ──
    const { createExpenseRecord } = await import(
      "@/app/actions/expense/expense"
    );
    const expenseResult = await createExpenseRecord({
      applicantRecordId: WORKER_NORMAL.id,
      date: "2026-05-06",
      title: "포장 자재 구매",
      description: "박스 200개",
      amount: 500_000,
      isCorpCard: true,
    });

    expect(expenseResult.success).toBe(true);

    // 지출결의 레코드 (승인 대기)
    const expenseRecords = store.list("지출결의");
    expect(expenseRecords).toHaveLength(1);
    const expense = expenseRecords[0];
    expect(expense.fields.승인상태).toBe("승인 대기");
    expect(expense.fields.금액).toBe(500_000);
    expect(expense.fields.건명).toBe("포장 자재 구매");
    expect(expense.fields.신청자).toEqual([WORKER_NORMAL.id]);

    // ── 2. 관리자 승인 (100만원 미만이라 ADMIN 즉시 승인 가능) ──
    const { updateApprovalStatus } = await import(
      "@/app/actions/admin/admin"
    );
    const approvalResult = await updateApprovalStatus(
      WORKER_ADMIN.id,
      expense.id,
      "EXPENSE",
      "승인 완료",
    );

    expect(approvalResult.success).toBe(true);

    // ── 3. 검증 ──
    const expenseAfter = store.get("지출결의", expense.id)!;
    expect(expenseAfter.fields.승인상태).toBe("승인 완료");
    // 지출결의서 PDF URL
    expect(String(expenseAfter.fields.지출결의서URL ?? "")).toMatch(
      /^https:\/\/mock-blob\.vercel-storage\.com\//,
    );
  });
});
