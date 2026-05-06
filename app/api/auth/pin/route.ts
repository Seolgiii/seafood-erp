import { NextResponse } from "next/server";
import { verifyWorkerPin } from "@/lib/airtable";
import {
  checkLockout,
  recordFailure,
  recordSuccess,
} from "@/lib/pin-rate-limit";

function lockoutMessage(retryAfterMs: number, prefix: string): string {
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  if (seconds < 60) return `${prefix} 약 ${seconds}초 후 다시 시도해주세요.`;
  const minutes = Math.ceil(seconds / 60);
  return `${prefix} 약 ${minutes}분 후 다시 시도해주세요.`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { workerId?: string; pin?: string };
    const workerId = typeof body.workerId === "string" ? body.workerId.trim() : "";
    const pin = typeof body.pin === "string" ? body.pin.trim() : "";

    if (!workerId || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return NextResponse.json(
        { error: "작업자와 4자리 PIN이 필요합니다" },
        { status: 400 }
      );
    }

    const lock = await checkLockout(workerId);
    if (lock.locked) {
      return NextResponse.json(
        { error: lockoutMessage(lock.retryAfterMs, "PIN 입력이 잠겼습니다.") },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(lock.retryAfterMs / 1000)),
          },
        }
      );
    }

    const worker = await verifyWorkerPin(workerId, pin);
    if (!worker) {
      const result = await recordFailure(workerId);
      if (result.locked) {
        return NextResponse.json(
          {
            error: lockoutMessage(
              result.retryAfterMs,
              "PIN을 5회 연속 잘못 입력했습니다."
            ),
          },
          {
            status: 429,
            headers: {
              "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)),
            },
          }
        );
      }
      return NextResponse.json(
        {
          error: `PIN이 올바르지 않습니다 (남은 시도 ${result.remainingAttempts}회)`,
        },
        { status: 401 }
      );
    }

    await recordSuccess(workerId);
    return NextResponse.json({ worker });
  } catch (e) {
    const message = e instanceof Error ? e.message : "인증 처리 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
