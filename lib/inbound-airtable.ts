import { createAirtableRecord, getAirtableRecord, patchAirtableRecord, tablePathSegment } from "@/lib/airtable";
import { AIRTABLE_TABLE, LOT_FIELDS } from "@/lib/airtable-schema";
import { asNumber } from "@/lib/lot-inventory";
import { computeLotStockAfterInbound } from "@/lib/stock-deduction";
import { seoulDateString } from "@/lib/date";
import {
  TXN,
  sanitizeSingleSelectValue,
  txnStatusInbound,
} from "@/lib/txn-schema";

/** 입출고 내역 테이블이 삭제된 경우 null 반환 → 쓰기 skip */
function txnTable(): string | null {
  const v = process.env.AIRTABLE_TXN_TABLE?.trim();
  if (!v) return null;
  return tablePathSegment(v);
}

function lotTable(): string {
  return tablePathSegment(process.env.AIRTABLE_LOT_TABLE?.trim() ?? AIRTABLE_TABLE.lots);
}

/** 입고: 트랜잭션 기록 + LOT 재고 증가를 서버에서 처리 */
export async function receiveInbound(opts: {
  workerRecordId: string;
  lotRecordId: string;
  receivedQty: number;
}): Promise<{ id: string }> {
  const lotPath = lotTable();
  const lotRec = await getAirtableRecord(lotPath, opts.lotRecordId);
  const lf = lotRec.fields;

  const currentStock = asNumber(lf[LOT_FIELDS.stockQty]) ?? 0;

  const afterStock = computeLotStockAfterInbound({
    currentStock,
    receivedQty: opts.receivedQty,
  });

  await patchAirtableRecord(lotPath, opts.lotRecordId, {
    [LOT_FIELDS.stockQty]: afterStock,
  });

  // Primary field(일시: Created Time)은 절대 전송하지 않음
  const txFields: Record<string, unknown> = {
    [TXN.worker]: [opts.workerRecordId],
    [TXN.lot]: [opts.lotRecordId],
    [TXN.bizDate]: seoulDateString(),
    [TXN.qty]: opts.receivedQty,
    [TXN.unit]: sanitizeSingleSelectValue("박스"),
    [TXN.io]: "입고",
    [TXN.status]: txnStatusInbound(),
  };

  const tbl = txnTable();
  if (!tbl) return { id: "" };
  return createAirtableRecord(tbl, txFields);
}
