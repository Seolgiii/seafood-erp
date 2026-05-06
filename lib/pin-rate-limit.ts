import "server-only";
/**
 * PIN 무차별 대입 방지 — Airtable 어댑터
 *
 * 분산 환경에서도 정확히 동작하도록 작업자 테이블의 다음 필드에 상태를 영속화합니다:
 *  - pin_fail_count    (number) — 누적 실패 횟수
 *  - pin_locked_until  (number) — 잠금 해제 시각(Unix ms). 0이면 잠금 없음
 *
 * 단계 전이(escalation)는 별도 필드 없이 lockedUntil 값만으로 추론합니다.
 * (직전 잠금이 30분 = TIER2_LOCK_MS 기간이었는지 판단)
 *
 * 비즈니스 로직은 lib/pin-rate-limit-core.ts에 분리되어 있어 동일 정책을 재사용합니다.
 */

import { fetchAirtable, patchAirtableRecord } from "@/lib/airtable";
import { AIRTABLE_TABLE } from "@/lib/airtable-schema";
import { logWarn } from "@/lib/logger";
import {
  type FailureResult,
  type LockStatus,
  type PinLockState,
  INITIAL_STATE,
  TIER1_LOCK_MS,
  TIER2_LOCK_MS,
  applyFailure,
  applySuccess,
  evaluateLockout,
} from "@/lib/pin-rate-limit-core";

export type { LockStatus, FailureResult } from "@/lib/pin-rate-limit-core";

const FIELD_FAIL_COUNT = "pin_fail_count";
const FIELD_LOCKED_UNTIL = "pin_locked_until";

function workersTablePath(): string {
  // tablePathSegment 처리는 fetchAirtable/patchAirtableRecord 내부에서 동일 규칙 적용 안되므로
  // 여기서 명시적으로 인코딩
  const raw =
    process.env.AIRTABLE_WORKERS_TABLE?.trim() ?? AIRTABLE_TABLE.workers;
  return encodeURIComponent(raw);
}

function isRecordId(s: string): boolean {
  return /^rec[a-zA-Z0-9]+$/.test(s);
}

async function readState(workerRecordId: string): Promise<PinLockState> {
  if (!isRecordId(workerRecordId)) return INITIAL_STATE;
  try {
    const data = (await fetchAirtable(
      `${workersTablePath()}/${workerRecordId}`,
    )) as { fields?: Record<string, unknown> };
    const fields = data.fields ?? {};
    const failures = Number(fields[FIELD_FAIL_COUNT] ?? 0);
    const lockedUntil = Number(fields[FIELD_LOCKED_UNTIL] ?? 0);

    // escalation 추론 한계:
    // lockedUntil 필드 하나로는 직전 잠금 단계(1단계 5분 / 2단계 30분) 정확 구분이 어려움.
    // 보수적으로 escalation=0 (잠금 풀림 후 다시 1단계부터)으로 시작 — 잠금 약화 위험을 피함.
    // 정확도 필요시 pin_lock_tier 필드 추가 권장.
    const escalation: 0 | 1 = 0;

    return {
      failures: Number.isFinite(failures) ? Math.max(0, failures) : 0,
      lockedUntil: Number.isFinite(lockedUntil) ? Math.max(0, lockedUntil) : 0,
      escalation,
    };
  } catch (e) {
    logWarn("[pin-rate-limit] readState 실패 — 기본 상태로 진행:", e);
    return INITIAL_STATE;
  }
}

async function writeState(
  workerRecordId: string,
  state: PinLockState,
): Promise<void> {
  if (!isRecordId(workerRecordId)) return;
  try {
    await patchAirtableRecord(
      decodeURIComponent(workersTablePath()), // patchAirtableRecord는 raw 이름 받음
      workerRecordId,
      {
        [FIELD_FAIL_COUNT]: state.failures,
        [FIELD_LOCKED_UNTIL]: state.lockedUntil,
      },
    );
  } catch (e) {
    // 실패해도 인증 흐름은 진행. 다만 잠금이 영속화되지 않음.
    logWarn(
      "[pin-rate-limit] writeState 실패 — 잠금 영속화 안 됨:",
      workerRecordId,
      e,
    );
  }
}

/** 잠금 여부 확인 + 풀림 후 단계 전이 영속화 */
export async function checkLockout(
  workerRecordId: string,
): Promise<LockStatus> {
  const state = await readState(workerRecordId);
  const now = Date.now();
  const { status, nextState } = evaluateLockout(state, now);
  // 단계 전이가 발생했으면 영속화 (변화 없으면 동일 객체)
  if (nextState !== state) {
    await writeState(workerRecordId, nextState);
  }
  return status;
}

/** 실패 1회 기록 */
export async function recordFailure(
  workerRecordId: string,
): Promise<FailureResult> {
  const state = await readState(workerRecordId);
  const now = Date.now();
  const { result, nextState } = applyFailure(state, now);
  await writeState(workerRecordId, nextState);
  return result;
}

/** 인증 성공 시 카운터 완전 초기화 */
export async function recordSuccess(workerRecordId: string): Promise<void> {
  await writeState(workerRecordId, applySuccess());
}

// 테스트용 — 운영 코드에서는 호출하지 않음
export async function resetAll(): Promise<void> {
  // Airtable에선 전체 초기화가 의미 없음 (worker별 독립). no-op.
}

// 잠금 단계 상수 재export — 호출자 호환성
export { TIER1_LOCK_MS, TIER2_LOCK_MS };
