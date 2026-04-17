import { AIRTABLE_TABLE } from "@/lib/airtable-schema";

export const DEFAULT_TXN_TABLE = AIRTABLE_TABLE.txn;

/** 입출고 내역(또는 동등한 트랜잭션) 테이블 필드 — Airtable 이름과 완전 일치해야 함 */
export const TXN = {
  /** Primary field(일시)는 Created Time 이므로 생성 시 서버에서 값 전송하지 않음 */
  date: "일시",
  /** 보조 날짜 필드(YYYY-MM-DD). Created Time과 별개로 화면/정산용 */
  bizDate: "일자",
  /** 입고/출고 구분 (Single select) */
  io: "입출고",
  worker: "작업자",
  /** LOT별 재고 행으로 연결되는 링크 필드 */
  lot: "LOT재고",
  qty: "신청 사양",
  unit: "해당 단위",
  status: "상태",
  yieldVar: "수율 오차",
  purchasePrice: "수매가",
  memo: "비고",
} as const;

/**
 * Single Select / Multi Select에 넣을 문자열 정규화.
 * API 페이로드는 JSON이라 필드 값은 문자열로만 보냄(객체/이중 따옴표 감싸기 방지).
 */
export function sanitizeSingleSelectValue(raw: unknown): string {
  let s = String(raw ?? "").trim();
  for (let i = 0; i < 3 && s.length >= 2; i++) {
    const a = s[0];
    const b = s[s.length - 1];
    if (a === '"' && b === '"') {
      s = s.slice(1, -1).trim();
      continue;
    }
    if (a === "'" && b === "'") {
      s = s.slice(1, -1).trim();
      continue;
    }
    if (a === "\u201c" && b === "\u201d") {
      s = s.slice(1, -1).trim();
      continue;
    }
    break;
  }
  return s;
}

function statusFromEnv(key: string, fallback: string): string {
  const v = process.env[key];
  const base = v != null && v.trim() !== "" ? v : fallback;
  return sanitizeSingleSelectValue(base);
}

/** 대기 상태 — 입출고 내역.상태 Single Select에 동일한 옵션이 미리 있어야 함 */
export function txnStatusPending(): string {
  return statusFromEnv("AIRTABLE_TXN_STATUS_PENDING", "대기");
}

/** 승인 완료 */
export function txnStatusApproved(): string {
  return statusFromEnv("AIRTABLE_TXN_STATUS_APPROVED", "승인 완료");
}

/** 출고 확정 완료 */
export function txnStatusCompleted(): string {
  return statusFromEnv("AIRTABLE_TXN_STATUS_COMPLETED", "완료");
}

/** 입고 기록용 상태 */
export function txnStatusInbound(): string {
  return statusFromEnv("AIRTABLE_TXN_STATUS_INBOUND", "완료");
}
