import "server-only";
// ─────────────────────────────────────────────────────────────────────────────
// PIN 무차별 대입 방지
// 정책:
//   - 1단계: 5회 연속 실패 → 5분 잠금
//   - 5분 잠금 풀린 뒤 다시 5회 실패 → 30분 잠금
//   - 30분 잠금이 풀리면 카운터 완전 초기화
//   - 인증 성공 시 즉시 초기화
//
// 저장: 모듈 레벨 Map (인-메모리). Vercel serverless 인스턴스 단위 상태이며,
// 인스턴스 재시작/스케일아웃 시 카운터가 줄어들 수 있지만 운영 규모상 무방.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_ATTEMPTS_PER_TIER = 5;
const TIER1_LOCK_MS = 5 * 60 * 1000;       // 5분
const TIER2_LOCK_MS = 30 * 60 * 1000;      // 30분
const ENTRY_TTL_MS = 60 * 60 * 1000;       // 1시간 미사용 entry는 정리

type State = {
  failures: number;
  lockedUntil: number;       // 0이면 잠금 해제 상태
  escalation: 0 | 1;          // 0 = 첫 라운드, 1 = 5분 잠금 풀린 뒤 두 번째 라운드
  lastTouched: number;
};

const states = new Map<string, State>();

function gc(now: number): void {
  for (const [k, s] of states) {
    if (s.lockedUntil <= now && now - s.lastTouched > ENTRY_TTL_MS) {
      states.delete(k);
    }
  }
}

/** 잠금 풀림 상태에서, 직전 잠금 단계에 따라 카운터·단계를 정리한다. */
function advanceAfterUnlock(s: State, now: number): void {
  if (s.lockedUntil === 0 || s.lockedUntil > now) return;
  if (s.escalation === 0) {
    s.escalation = 1;
    s.failures = 0;
    s.lockedUntil = 0;
    s.lastTouched = now;
  } else {
    // 30분 잠금이 풀림 → 완전 초기화
    s.failures = 0;
    s.lockedUntil = 0;
    s.escalation = 0;
    s.lastTouched = now;
  }
}

export type LockStatus =
  | { locked: true; retryAfterMs: number }
  | { locked: false };

/**
 * 잠금 여부를 확인하고, 잠금이 풀렸다면 단계를 진행시킵니다.
 * 반환값이 locked=true면 현 시도를 거부해야 합니다.
 */
export function checkLockout(key: string): LockStatus {
  const now = Date.now();
  if (Math.random() < 0.01) gc(now);

  const s = states.get(key);
  if (!s) return { locked: false };

  if (s.lockedUntil > now) {
    return { locked: true, retryAfterMs: s.lockedUntil - now };
  }
  advanceAfterUnlock(s, now);
  return { locked: false };
}

export type FailureResult =
  | { locked: true; retryAfterMs: number }
  | { locked: false; remainingAttempts: number };

/**
 * 실패 1회를 기록하고, 5회에 도달하면 단계별 잠금을 적용합니다.
 */
export function recordFailure(key: string): FailureResult {
  const now = Date.now();
  let s = states.get(key);
  if (!s) {
    s = { failures: 0, lockedUntil: 0, escalation: 0, lastTouched: now };
    states.set(key, s);
  } else {
    advanceAfterUnlock(s, now);
  }

  s.failures += 1;
  s.lastTouched = now;

  if (s.failures >= MAX_ATTEMPTS_PER_TIER) {
    const lockMs = s.escalation === 0 ? TIER1_LOCK_MS : TIER2_LOCK_MS;
    s.lockedUntil = now + lockMs;
    return { locked: true, retryAfterMs: lockMs };
  }
  return { locked: false, remainingAttempts: MAX_ATTEMPTS_PER_TIER - s.failures };
}

/** 인증 성공 시 카운터를 완전 초기화합니다. */
export function recordSuccess(key: string): void {
  states.delete(key);
}

/** 테스트·운영 도구용 — 즉시 초기화 */
export function resetAll(): void {
  states.clear();
}
