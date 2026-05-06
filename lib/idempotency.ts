import { NextResponse } from "next/server";
import { log, logWarn } from "@/lib/logger";

/**
 * 서버 메모리 기반 idempotency 미들웨어
 *
 * 동작:
 *  - 클라이언트가 `X-Idempotency-Key: <uuid>` 헤더를 보내면 5분간 응답을 캐시
 *  - 같은 key의 두 번째 요청은 캐시된 응답을 그대로 반환 (재실행 X)
 *  - 진행 중인 동일 key 요청은 409로 거부
 *  - 헤더가 없으면 idempotency 비활성 (backward compatible — 기존 호출 영향 없음)
 *
 * 한계:
 *  - Vercel serverless 인스턴스 간 메모리 분리. 분산 환경에서는 인스턴스 단위 보호.
 *  - 1인 운영 + 짧은 재시도(수초) 시나리오의 중복 제출 99% 차단.
 *  - 진정한 분산 idempotency는 향후 Vercel KV 등 도입 시.
 */

const TTL_MS = 5 * 60 * 1000; // 5분
const MAX_ENTRIES = 1000;     // 메모리 폭주 방어용 상한

type CacheEntry =
  | { type: "pending"; expiresAt: number }
  | { type: "done"; bodyJson: unknown; status: number; expiresAt: number };

const cache = new Map<string, CacheEntry>();

function cleanup(now: number) {
  if (cache.size < MAX_ENTRIES) {
    // 일반 정리: 만료된 항목만 제거
    for (const [k, v] of cache) {
      if (v.expiresAt <= now) cache.delete(k);
    }
    return;
  }
  // 비정상 폭주: 오래된 절반 제거
  const entries = [...cache.entries()].sort(
    (a, b) => a[1].expiresAt - b[1].expiresAt,
  );
  const half = Math.floor(entries.length / 2);
  for (let i = 0; i < half; i++) {
    cache.delete(entries[i][0]);
  }
  logWarn(
    `[idempotency] cache exceeded MAX_ENTRIES — pruned ${half} oldest entries`,
  );
}

function isValidKey(key: string): boolean {
  // UUID v4 또는 일반 토큰(8~64자 hex/alphanumeric/dash) 허용
  return /^[a-zA-Z0-9-]{8,64}$/.test(key);
}

/**
 * @param request 원본 Request
 * @param handler idempotency 통과 시 실행할 실제 핸들러 (NextResponse 반환)
 * @returns NextResponse — 캐시 hit이면 캐시된 응답 재구성, miss면 handler 실행 후 캐싱
 */
export async function withIdempotency(
  request: Request,
  handler: () => Promise<NextResponse>,
): Promise<NextResponse> {
  const rawKey = request.headers.get("x-idempotency-key")?.trim() ?? "";
  // 헤더 없거나 형식 부적합 → idempotency 비활성, 그대로 실행
  if (!rawKey || !isValidKey(rawKey)) {
    return handler();
  }

  const now = Date.now();
  cleanup(now);

  const existing = cache.get(rawKey);
  if (existing) {
    if (existing.type === "pending") {
      // 동일 key가 처리 중 — 두 번째 요청은 충돌 응답
      log("[idempotency] in-flight conflict:", rawKey);
      return NextResponse.json(
        {
          error: "동일 요청이 처리 중입니다. 잠시 후 다시 시도해주세요.",
          idempotency: "in_flight",
        },
        { status: 409 },
      );
    }
    // 완료된 응답 재반환
    log("[idempotency] cache hit:", rawKey);
    return NextResponse.json(existing.bodyJson, { status: existing.status });
  }

  // 처음 보는 key — 진행 중 마킹 후 핸들러 실행
  cache.set(rawKey, { type: "pending", expiresAt: now + TTL_MS });
  try {
    const res = await handler();
    // 응답 본문을 JSON으로 추출해 캐시 (스트림 소비 방지를 위해 clone 사용)
    let bodyJson: unknown = null;
    try {
      bodyJson = await res.clone().json();
    } catch {
      // JSON이 아닌 응답은 캐싱하지 않음 (다음 요청은 다시 실행됨)
      cache.delete(rawKey);
      return res;
    }
    cache.set(rawKey, {
      type: "done",
      bodyJson,
      status: res.status,
      expiresAt: Date.now() + TTL_MS,
    });
    return res;
  } catch (e) {
    // 핸들러 예외 시 캐시 제거 — 클라이언트 재시도 가능하도록
    cache.delete(rawKey);
    throw e;
  }
}

/** 테스트·디버그 용도. 운영에선 호출 안 함 */
export function _resetIdempotencyCache(): void {
  cache.clear();
}
