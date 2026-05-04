import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  checkLockout,
  recordFailure,
  recordSuccess,
  resetAll,
} from "./pin-rate-limit";

const KEY = "recWORKER001";
const MAX = 5;
const TIER1_MS = 5 * 60 * 1000;
const TIER2_MS = 30 * 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  resetAll();
});

afterEach(() => {
  vi.useRealTimers();
  resetAll();
});

describe("PIN rate limit — 기본 동작", () => {
  test("초기 상태에서는 잠금 없음", () => {
    expect(checkLockout(KEY)).toEqual({ locked: false });
  });

  test("실패 1회 — 남은 시도 횟수만 보고", () => {
    const r = recordFailure(KEY);
    expect(r).toEqual({ locked: false, remainingAttempts: MAX - 1 });
  });

  test("실패 4회까지는 잠금 없음", () => {
    for (let i = 1; i <= 4; i++) {
      const r = recordFailure(KEY);
      expect(r).toEqual({ locked: false, remainingAttempts: MAX - i });
    }
    expect(checkLockout(KEY)).toEqual({ locked: false });
  });

  test("성공 시 카운터 즉시 초기화", () => {
    recordFailure(KEY);
    recordFailure(KEY);
    recordFailure(KEY);
    recordSuccess(KEY);
    // 다시 실패해도 처음부터 카운팅
    expect(recordFailure(KEY)).toEqual({ locked: false, remainingAttempts: MAX - 1 });
  });
});

describe("PIN rate limit — 1단계 5분 잠금", () => {
  test("5회 실패 시 5분 잠금 발동", () => {
    for (let i = 0; i < 4; i++) recordFailure(KEY);
    const fifth = recordFailure(KEY);
    expect(fifth).toEqual({ locked: true, retryAfterMs: TIER1_MS });
  });

  test("잠금 중 checkLockout은 잠금 표시 + 남은 시간", () => {
    for (let i = 0; i < 5; i++) recordFailure(KEY);

    vi.advanceTimersByTime(2 * 60 * 1000); // 2분 경과
    const status = checkLockout(KEY);
    expect(status.locked).toBe(true);
    if (status.locked) {
      expect(status.retryAfterMs).toBe(TIER1_MS - 2 * 60 * 1000);
    }
  });

  test("5분 정확히 경과하면 잠금 해제", () => {
    for (let i = 0; i < 5; i++) recordFailure(KEY);

    vi.advanceTimersByTime(TIER1_MS);
    expect(checkLockout(KEY)).toEqual({ locked: false });
  });
});

describe("PIN rate limit — 2단계 30분 잠금", () => {
  test("1차 잠금 풀린 뒤 5회 실패 → 30분 잠금", () => {
    for (let i = 0; i < 5; i++) recordFailure(KEY);
    vi.advanceTimersByTime(TIER1_MS); // 5분 경과 → 잠금 해제

    // 단계 진행 (해제 시 카운터 0으로 리셋)
    expect(checkLockout(KEY)).toEqual({ locked: false });

    for (let i = 0; i < 4; i++) {
      const r = recordFailure(KEY);
      expect(r.locked).toBe(false);
    }
    const fifth = recordFailure(KEY);
    expect(fifth).toEqual({ locked: true, retryAfterMs: TIER2_MS });
  });

  test("30분 잠금 중 checkLockout은 정확한 남은 시간 보고", () => {
    // 2단계까지 진입
    for (let i = 0; i < 5; i++) recordFailure(KEY);
    vi.advanceTimersByTime(TIER1_MS);
    checkLockout(KEY);
    for (let i = 0; i < 5; i++) recordFailure(KEY);

    vi.advanceTimersByTime(10 * 60 * 1000); // 10분 경과
    const status = checkLockout(KEY);
    expect(status.locked).toBe(true);
    if (status.locked) {
      expect(status.retryAfterMs).toBe(TIER2_MS - 10 * 60 * 1000);
    }
  });
});

describe("PIN rate limit — 30분 후 완전 초기화", () => {
  test("30분 잠금 풀리면 카운터 0으로 리셋 (1단계로 회귀)", () => {
    // 2단계 진입 + 30분 잠금 발동
    for (let i = 0; i < 5; i++) recordFailure(KEY);
    vi.advanceTimersByTime(TIER1_MS);
    checkLockout(KEY);
    for (let i = 0; i < 5; i++) recordFailure(KEY);

    vi.advanceTimersByTime(TIER2_MS);
    expect(checkLockout(KEY)).toEqual({ locked: false });

    // 다시 4회 실패해도 잠금 없음 (카운터가 0부터)
    for (let i = 0; i < 4; i++) {
      const r = recordFailure(KEY);
      expect(r.locked).toBe(false);
    }
    // 5회째에서 다시 1단계 잠금
    const fifth = recordFailure(KEY);
    expect(fifth).toEqual({ locked: true, retryAfterMs: TIER1_MS });
  });
});

describe("PIN rate limit — 다중 워커 격리", () => {
  test("작업자 A의 실패가 작업자 B에 영향 주지 않음", () => {
    const A = "recA";
    const B = "recB";
    for (let i = 0; i < 5; i++) recordFailure(A);

    expect(checkLockout(A).locked).toBe(true);
    expect(checkLockout(B).locked).toBe(false);

    // B는 정상 카운팅
    expect(recordFailure(B)).toEqual({ locked: false, remainingAttempts: MAX - 1 });
  });
});

describe("PIN rate limit — 인증 성공 처리", () => {
  test("잠금 풀린 직후 성공하면 카운터 완전 초기화", () => {
    for (let i = 0; i < 5; i++) recordFailure(KEY);
    vi.advanceTimersByTime(TIER1_MS);
    checkLockout(KEY); // 단계 진행

    recordSuccess(KEY);

    // 다시 실패해도 1단계부터
    expect(recordFailure(KEY)).toEqual({ locked: false, remainingAttempts: MAX - 1 });
  });
});
