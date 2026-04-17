import { createAirtableRecord, tablePathSegment } from "@/lib/airtable";
import {
  DEFAULT_TXN_TABLE,
  TXN,
  sanitizeSingleSelectValue,
  txnStatusPending,
} from "@/lib/txn-schema";
import { seoulDateString } from "@/lib/date";

/** 입출고 내역 테이블이 삭제된 경우 null 반환 → 쓰기 skip */
function txnTable(): string | null {
  const v = process.env.AIRTABLE_TXN_TABLE?.trim();
  if (!v) return null;
  return tablePathSegment(v);
}

export async function createOutboundPendingRecord(opts: {
  workerRecordId: string;
  lotRecordId: string;
  requestedQty: number;
  unitLabel: string;
  yieldVarianceDetail: number;
}): Promise<{ id: string }> {
  const tbl = txnTable();
  if (!tbl) return { id: "" };
  const fields: Record<string, unknown> = {
    [TXN.worker]: [opts.workerRecordId],
    [TXN.lot]: [opts.lotRecordId],
    [TXN.bizDate]: seoulDateString(),
    [TXN.qty]: opts.requestedQty,
    [TXN.unit]: sanitizeSingleSelectValue(opts.unitLabel),
    [TXN.io]: "출고",
    [TXN.status]: txnStatusPending(),
  };
  if (opts.yieldVarianceDetail !== 0) {
    fields[TXN.yieldVar] = opts.yieldVarianceDetail;
  }
  return createAirtableRecord(tbl, fields);
}
