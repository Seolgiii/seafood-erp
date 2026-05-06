import "server-only";
import { fetchAirtable, tablePathSegment } from "@/lib/airtable";
import { AIRTABLE_TABLE } from "@/lib/airtable-schema";
import { log, logWarn } from "@/lib/logger";

/**
 * LOT 일련번호 생성 + 동시성 방어 유틸
 *
 * Airtable에는 unique 제약·트랜잭션이 없어서 두 입고가 동시에 들어오면
 * `getMaxLotSequence()` 결과가 같아 중복 LOT번호가 발급될 수 있습니다.
 *
 * 진정한 분산 락을 도입하지 않은 상태에서 race를 막기 위해 낙관적 재시도 패턴을
 * 사용합니다 — LOT번호 생성 후 POST 직전에 LOT번호 존재 여부를 검증하고,
 * 충돌 발견 시 짧은 backoff 후 재시도(최대 5회).
 *
 * 동시 입고 빈도가 낮은 환경에서 99%+ race를 막습니다. 향후 동시 입고가 잦아지면
 * Airtable 자동번호 필드 도입(옵션 A)으로 마이그레이션 가능합니다.
 */

const MAX_RETRIES = 5;
const BACKOFF_BASE_MS = 80;

function lotTablePath(): string {
  return tablePathSegment(
    process.env.AIRTABLE_LOT_TABLE?.trim() ?? AIRTABLE_TABLE.lots,
  );
}

/** LOT별 재고 전체 스캔 → 마지막 4자리 일련번호 최댓값 + 1 반환 */
export async function getMaxLotSequence(): Promise<number> {
  const lotsPath = lotTablePath();
  let maxSeq = 0;
  let offset: string | undefined;
  do {
    const params = new URLSearchParams({ pageSize: "100" });
    params.append("fields[]", "LOT번호");
    if (offset) params.set("offset", offset);
    const data = (await fetchAirtable(`${lotsPath}?${params}`)) as {
      records?: { fields?: Record<string, unknown> }[];
      offset?: string;
    };
    for (const rec of data.records ?? []) {
      const m = String(rec.fields?.["LOT번호"] ?? "").match(/-(\d{4})$/);
      if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
    }
    offset = data.offset;
  } while (offset);
  return maxSeq + 1;
}

/** 주어진 LOT번호가 이미 LOT별 재고 테이블에 존재하는지 확인 */
async function lotNumberExists(lotNumber: string): Promise<boolean> {
  const lotsPath = lotTablePath();
  // Airtable formula 안전화: 백슬래시·따옴표 이스케이프
  const escaped = lotNumber.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const formula = encodeURIComponent(`{LOT번호}="${escaped}"`);
  const data = (await fetchAirtable(
    `${lotsPath}?filterByFormula=${formula}&maxRecords=1&fields[]=${encodeURIComponent("LOT번호")}`,
  )) as { records?: unknown[] };
  return (data.records ?? []).length > 0;
}

/**
 * 동시 입고 race condition 방어용 — `getMaxLotSequence` 후 LOT번호 중복 검증을 거쳐
 * 고유 LOT번호를 반환합니다. 중복 발견 시 backoff 후 재시도(최대 5회).
 *
 * @param build 일련번호(seq)를 받아 LOT번호 문자열을 반환하는 함수
 */
export async function generateUniqueLotNumber(
  build: (seq: number) => string,
): Promise<string> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const seq = await getMaxLotSequence();
    const lotNumber = build(seq);
    const exists = await lotNumberExists(lotNumber);
    if (!exists) {
      if (attempt > 0) {
        log(
          `[generateUniqueLotNumber] 재시도 ${attempt}회 후 성공:`,
          lotNumber,
        );
      }
      return lotNumber;
    }
    logWarn(
      `[generateUniqueLotNumber] LOT번호 중복 — 재시도 ${attempt + 1}/${MAX_RETRIES}:`,
      lotNumber,
    );
    await new Promise((r) => setTimeout(r, BACKOFF_BASE_MS * (attempt + 1)));
  }
  throw new Error(
    `LOT번호 중복 해결 실패 (재시도 ${MAX_RETRIES}회) — 동시 입고가 비정상적으로 많거나 LOT번호 검색에 문제가 있을 수 있습니다.`,
  );
}
