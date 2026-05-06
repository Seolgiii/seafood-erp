import { describe, expect, test, vi } from "vitest";
import { store } from "./airtable-store";
import {
  ALL_MASTERS,
  PRODUCT_MACKEREL,
  STORAGE_HANRIM,
  WORKER_INACTIVE,
  WORKER_NORMAL,
} from "./fixtures";

/**
 * 시나리오 13 — 비활성 작업자 차단
 * 시나리오 14 — PIN 5회 실패 잠금 (5분 → 30분 escalation)
 * 시나리오 15 — 작업자 ID 위조 시도 차단
 */

describe("시나리오 13 — 비활성 작업자 차단", () => {
  test("활성=0 작업자가 입고 신청 시도 → INACTIVE 거부", async () => {
    store.seed("작업자", ALL_MASTERS.workers);
    store.seed("품목마스터", ALL_MASTERS.products);
    store.seed("보관처 마스터", ALL_MASTERS.storages);

    const { createInventoryRecord } = await import(
      "@/app/actions/inventory/inbound"
    );
    const result = await createInventoryRecord({
      작업자: WORKER_INACTIVE.id, // 활성=0
      품목명: PRODUCT_MACKEREL.fields.품목명 as string,
      입고일자: "2026-05-06",
      규격: "11",
      미수: "26",
      "입고수량(BOX)": 50,
      수매가: 50000,
      storageRecordId: STORAGE_HANRIM.id,
    });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/비활성/);
    // 입고 관리 레코드 생성되지 않음
    expect(store.list("입고 관리")).toHaveLength(0);
  });

  test("server-auth requireWorker가 INACTIVE 코드로 throw", async () => {
    store.seed("작업자", ALL_MASTERS.workers);

    const { requireWorker, AuthError } = await import("@/lib/server-auth");
    await expect(requireWorker(WORKER_INACTIVE.id)).rejects.toThrow(AuthError);
    await expect(requireWorker(WORKER_INACTIVE.id)).rejects.toMatchObject({
      code: "INACTIVE",
    });
  });
});

describe("시나리오 14 — PIN 5회 실패 잠금 (Airtable 영속화)", () => {
  test("5회 실패 시 1단계 5분 잠금 → Airtable에 영속화", async () => {
    // 평문 PIN '1111'을 가진 활성 작업자
    store.seed("작업자", ALL_MASTERS.workers);

    const {
      checkLockout,
      recordFailure,
      recordSuccess,
    } = await import("@/lib/pin-rate-limit");

    // 초기엔 잠금 없음
    const init = await checkLockout(WORKER_NORMAL.id);
    expect(init.locked).toBe(false);

    // 4회 실패 — 잠금 X
    for (let i = 0; i < 4; i++) {
      const r = await recordFailure(WORKER_NORMAL.id);
      expect(r.locked).toBe(false);
    }

    // 5회째 — 잠금 발동
    const fifth = await recordFailure(WORKER_NORMAL.id);
    expect(fifth.locked).toBe(true);
    if (fifth.locked) {
      expect(fifth.retryAfterMs).toBe(5 * 60 * 1000); // 5분
    }

    // Airtable 작업자 레코드에 pin_fail_count, pin_locked_until 영속화
    const worker = store.get("작업자", WORKER_NORMAL.id)!;
    expect(Number(worker.fields.pin_fail_count)).toBe(5);
    expect(Number(worker.fields.pin_locked_until)).toBeGreaterThan(Date.now());

    // 잠금 중엔 checkLockout이 잠금 상태 반환
    const status = await checkLockout(WORKER_NORMAL.id);
    expect(status.locked).toBe(true);

    // 인증 성공 시 카운터 완전 초기화
    await recordSuccess(WORKER_NORMAL.id);
    const workerAfter = store.get("작업자", WORKER_NORMAL.id)!;
    expect(Number(workerAfter.fields.pin_fail_count)).toBe(0);
    expect(Number(workerAfter.fields.pin_locked_until)).toBe(0);
  });

  test("verifyWorkerPin — 평문 PIN 매칭 시 자동 해시 마이그레이션", async () => {
    store.seed("작업자", ALL_MASTERS.workers);

    const { verifyWorkerPin } = await import("@/lib/airtable");
    // 정확한 PIN
    const result = await verifyWorkerPin(WORKER_NORMAL.id, "3333");
    expect(result).not.toBeNull();
    expect(result!.role).toBe("WORKER");

    // 자동 마이그레이션은 비동기 (.then) — 잠시 대기 후 확인
    await new Promise((r) => setTimeout(r, 50));

    const workerAfter = store.get("작업자", WORKER_NORMAL.id)!;
    // pin_hash가 채워져 있어야 함 (scrypt:salt:hash 형태)
    expect(String(workerAfter.fields.pin_hash ?? "")).toMatch(/^scrypt:[0-9a-f]+:[0-9a-f]+$/);
  });

  test("verifyWorkerPin — 잘못된 PIN → null", async () => {
    store.seed("작업자", ALL_MASTERS.workers);

    const { verifyWorkerPin } = await import("@/lib/airtable");
    const result = await verifyWorkerPin(WORKER_NORMAL.id, "9999");
    expect(result).toBeNull();
  });
});

describe("시나리오 15 — 작업자 ID 위조 시도 차단", () => {
  test("형식이 잘못된 ID → NO_SESSION", async () => {
    const { requireWorker, AuthError } = await import("@/lib/server-auth");
    await expect(requireWorker("not-a-record-id")).rejects.toThrow(AuthError);
    await expect(requireWorker("not-a-record-id")).rejects.toMatchObject({
      code: "NO_SESSION",
    });
  });

  test("존재하지 않는 record ID → INVALID_WORKER", async () => {
    store.seed("작업자", ALL_MASTERS.workers);

    const { requireWorker, AuthError } = await import("@/lib/server-auth");
    await expect(requireWorker("recFAKEID00000000")).rejects.toThrow(AuthError);
    await expect(requireWorker("recFAKEID00000000")).rejects.toMatchObject({
      code: "INVALID_WORKER",
    });
  });

  test("server action: 위조된 workerId로 입고 신청 → 거부", async () => {
    store.seed("작업자", ALL_MASTERS.workers);
    store.seed("품목마스터", ALL_MASTERS.products);
    store.seed("보관처 마스터", ALL_MASTERS.storages);

    const { createInventoryRecord } = await import(
      "@/app/actions/inventory/inbound"
    );
    const result = await createInventoryRecord({
      작업자: "recFAKEID00000000",
      품목명: PRODUCT_MACKEREL.fields.품목명 as string,
      입고일자: "2026-05-06",
      규격: "11",
      미수: "26",
      "입고수량(BOX)": 10,
      수매가: 50000,
      storageRecordId: STORAGE_HANRIM.id,
    });
    expect(result.success).toBe(false);
    expect(store.list("입고 관리")).toHaveLength(0);
  });

  test("requireAdmin — WORKER role이 ADMIN 작업 시도 → FORBIDDEN", async () => {
    store.seed("작업자", ALL_MASTERS.workers);

    const { requireAdmin, AuthError } = await import("@/lib/server-auth");
    await expect(requireAdmin(WORKER_NORMAL.id)).rejects.toThrow(AuthError);
    await expect(requireAdmin(WORKER_NORMAL.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
