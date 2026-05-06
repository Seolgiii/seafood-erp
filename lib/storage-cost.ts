import "server-only";
/**
 * 보관처 비용 이력 조회
 *
 * LOT의 입고일자와 보관처를 받아 해당 시점에 적용된
 * 냉장료·입출고비·노조비를 반환합니다.
 *
 * 적용 조건: 적용시작일 <= 입고일자 <= 적용종료일
 * 적용종료일이 비어 있으면 현재 유효한 요금으로 간주합니다.
 *
 * 복수 행이 조건을 만족하면 적용시작일이 가장 최신인 행을 우선합니다.
 */

import { fetchAirtable, tablePathSegment } from "@/lib/airtable";
import { AIRTABLE_TABLE, STORAGE_COST_FIELDS } from "@/lib/airtable-schema";
import { StorageCostFieldsSchema, reportSchemaIssue } from "@/lib/schemas";

// ─── 타입 ────────────────────────────────────────────────────────────────────

export type StorageCost = {
  refrigerationFee: number | null; // 냉장료 (원/박스 등)
  inOutFee: number | null;         // 입출고비
  unionFee: number | null;         // 노조비
};

// ─── 내부 유틸 ───────────────────────────────────────────────────────────────

function storageCostTable(): string {
  return tablePathSegment(
    process.env.AIRTABLE_STORAGE_COST_TABLE?.trim() ??
      AIRTABLE_TABLE.storageCostHistory
  );
}

function escapeStr(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ─── 공개 함수 ───────────────────────────────────────────────────────────────

/**
 * LOT의 보관처와 입고일자 기준으로 적용 요금을 반환합니다.
 *
 * @param storage     LOT의 보관처명 (예: "A냉동창고")
 * @param inboundDate 입고일자 YYYY-MM-DD
 * @returns 냉장료·입출고비·노조비 (해당 행 없으면 null)
 */
export async function getStorageCostForLot(
  storage: string,
  inboundDate: string // YYYY-MM-DD
): Promise<StorageCost | null> {
  if (!storage.trim() || !inboundDate.trim()) return null;

  const SC = STORAGE_COST_FIELDS;
  const tbl = storageCostTable();
  const esc = escapeStr(storage.trim());
  const date = inboundDate.trim();

  /**
   * 조건:
   *   1. 보관처 일치
   *   2. 적용시작일 <= 입고일자  →  NOT(IS_AFTER(적용시작일, 입고일자))
   *   3. 적용종료일이 비어있거나 >= 입고일자  →  OR(blank, NOT(IS_BEFORE(종료일, 입고일자)))
   */
  const formula = [
    `AND(`,
    `  {${SC.storage}} = "${esc}",`,
    `  NOT(IS_AFTER({${SC.startDate}}, "${date}")),`,
    `  OR(`,
    `    {${SC.endDate}} = "",`,
    `    NOT(IS_BEFORE({${SC.endDate}}, "${date}"))`,
    `  )`,
    `)`,
  ].join("");

  const fieldList = [SC.storage, SC.startDate, SC.endDate, SC.refrigerationFee, SC.inOutFee, SC.unionFee];
  const fieldsQs = fieldList
    .map((f) => `fields[]=${encodeURIComponent(f)}`)
    .join("&");

  const path = `${tbl}?filterByFormula=${encodeURIComponent(formula)}&${fieldsQs}&pageSize=20`;
  const data = await fetchAirtable(path);
  const records = (data.records ?? []) as {
    id: string;
    fields: Record<string, unknown>;
  }[];

  if (records.length === 0) return null;

  // 복수 행 → 적용시작일이 가장 최신인 행 우선 (내림차순 정렬 후 첫 번째)
  records.sort((a, b) => {
    const da = String(a.fields[SC.startDate] ?? "");
    const db = String(b.fields[SC.startDate] ?? "");
    return db.localeCompare(da);
  });

  const f = records[0].fields;

  // zod 검증 (모니터링 모드)
  const parsed = StorageCostFieldsSchema.safeParse(f);
  if (!parsed.success) {
    reportSchemaIssue("getStorageCostForLot", records[0].id, parsed.error);
  }
  return {
    refrigerationFee: toNum(f[SC.refrigerationFee]),
    inOutFee: toNum(f[SC.inOutFee]),
    unionFee: toNum(f[SC.unionFee]),
  };
}

/**
 * 여러 LOT를 한 번에 조회할 때 사용하는 배치 버전.
 * items 배열의 각 { storage, inboundDate }에 대해 순서대로 결과를 반환합니다.
 *
 * (보관처가 동일한 LOT가 많을 경우 중복 호출을 줄이기 위해 결과를 캐시합니다.)
 */
export async function getStorageCostsBatch(
  items: { storage: string; inboundDate: string }[]
): Promise<(StorageCost | null)[]> {
  const cache = new Map<string, StorageCost | null>();

  const results = await Promise.all(
    items.map(async ({ storage, inboundDate }) => {
      const key = `${storage}__${inboundDate}`;
      if (cache.has(key)) return cache.get(key)!;
      const cost = await getStorageCostForLot(storage, inboundDate);
      cache.set(key, cost);
      return cost;
    })
  );

  return results;
}
