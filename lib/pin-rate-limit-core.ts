/**
 * PIN 무차별 대입 방지 — 저장소 독립적인 순수 로직
 *
 * 정책:
 *   - 1단계: 5회 연속 실패 → 5분 잠금
 *   - 5분 잠금 풀린 뒤 다시 5회 실패 → 30분 잠금
 *   - 30분 잠금이 풀리면 카운터 완전 초기화
 *   - 인증 성공 시 즉시 초기화
 *
 * 이 모듈은 외부 I/O를 갖지 않습니다. State는 호출자가 보관·persist 합니다.
 * (메모리 / Airtable / Redis 어느 저장소든 동일 로직 재사용)
 */

export const MAX_ATTEMPTS_PER_TIER = 5;
export const TIER1_LOCK_MS = 5 * 60 * 1000; // 5분
export const TIER2_LOCK_MS = 30 * 60 * 1000; // 30분

export type PinLockState = {
  failures: number;
  lockedUntil: number; // Unix ms. 0이면 잠금 해제 상태
  escalation: 0 | 1; // 0 = 첫 라운드, 1 = 5분 잠금 풀린 뒤 두 번째 라운드
};

export const INITIAL_STATE: PinLockState = {
  failures: 0,
  lockedUntil: 0,
  escalation: 0,
};

export type LockStatus =
  | { locked: true; retryAfterMs: number }
  | { locked: false };

export type FailureResult =
  | { locked: true; retryAfterMs: number }
  | { locked: false; remainingAttempts: number };

/** 잠금이 풀렸는지 평가하고 풀렸다면 다음 단계 상태로 전이시킨다. */
export function advanceAfterUnlock(
  s: PinLockState,
  now: number,
): PinLockState {
  if (s.lockedUntil === 0 || s.lockedUntil > now) return s;
  if (s.escalation === 0) {
    // 1단계 잠금 풀림 → 2단계 진입 (카운터만 0)
    return { failures: 0, lockedUntil: 0, escalation: 1 };
  }
  // 2단계 잠금 풀림 → 완전 초기화
  return { failures: 0, lockedUntil: 0, escalation: 0 };
}

/**
 * 잠금 여부 평가 + 잠금 풀림 후 단계 전이.
 * 반환: 현재 잠금 여부 + 전이된 새 state (변화 없으면 동일 객체)
 */
export function evaluateLockout(
  s: PinLockState,
  now: number,
): { status: LockStatus; nextState: PinLockState } {
  if (s.lockedUntil > now) {
    return {
      status: { locked: true, retryAfterMs: s.lockedUntil - now },
      nextState: s,
    };
  }
  const nextState = advanceAfterUnlock(s, now);
  return { status: { locked: false }, nextState };
}

/** 실패 1회 기록. 누적 5회 도달 시 단계별 잠금 적용. */
export function applyFailure(
  s: PinLockState,
  now: number,
): { result: FailureResult; nextState: PinLockState } {
  const transitioned = advanceAfterUnlock(s, now);
  const failures = transitioned.failures + 1;

  if (failures >= MAX_ATTEMPTS_PER_TIER) {
    const lockMs =
      transitioned.escalation === 0 ? TIER1_LOCK_MS : TIER2_LOCK_MS;
    const nextState: PinLockState = {
      failures,
      lockedUntil: now + lockMs,
      escalation: transitioned.escalation,
    };
    return {
      result: { locked: true, retryAfterMs: lockMs },
      nextState,
    };
  }

  const nextState: PinLockState = {
    ...transitioned,
    failures,
  };
  return {
    result: {
      locked: false,
      remainingAttempts: MAX_ATTEMPTS_PER_TIER - failures,
    },
    nextState,
  };
}

/** 인증 성공 시 카운터 완전 초기화 */
export function applySuccess(): PinLockState {
  return INITIAL_STATE;
}
