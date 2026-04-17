import { createAirtableRecord, getAirtableRecord, patchAirtableRecord, tablePathSegment } from "@/lib/airtable";
import { AIRTABLE_TABLE, LOT_FIELDS, PRODUCT_FIELDS } from "@/lib/airtable-schema";
import { asNumber } from "@/lib/lot-inventory";
import { computeLotStockAfterInbound } from "@/lib/stock-deduction";
import { seoulDateString } from "@/lib/date";
import {
  DEFAULT_TXN_TABLE,
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

function productTable(): string {
  return tablePathSegment(
    process.env.AIRTABLE_PRODUCTS_TABLE?.trim() ?? AIRTABLE_TABLE.products
  );
}

function firstLinkedId(raw: unknown): string | null {
  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === "string") return raw[0];
  if (typeof raw === "string" && raw.startsWith("rec")) return raw;
  return null;
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

  const productId = firstLinkedId(lf[LOT_FIELDS.productLink]);
  if (!productId) throw new Error("Missing product on LOT");

  const prRec = await getAirtableRecord(productTable(), productId);
  const pf = prRec.fields;

  const baseU = String(pf[PRODUCT_FIELDS.baseUnit] ?? "").trim();
  const detailU = String(pf[PRODUCT_FIELDS.detailUnit] ?? "").trim();
  const ratio = asNumber(pf[PRODUCT_FIELDS.detailPerBase]);
  const R = ratio != null && ratio > 1 ? ratio : null;

  const B0 = asNumber(lf[LOT_FIELDS.qtyBase]) ?? 0;
  const D0 = asNumber(lf[LOT_FIELDS.qtyDetail]) ?? 0;

  const after = computeLotStockAfterInbound({
    qtyBase: B0,
    qtyDetail: D0,
    receivedQty: opts.receivedQty,
    receiveUnit: baseU,
    productBaseUnit: baseU,
    productDetailUnit: detailU,
    detailPerBase: R,
  });

  await patchAirtableRecord(lotPath, opts.lotRecordId, {
    [LOT_FIELDS.qtyBase]: after.qtyBase,
    [LOT_FIELDS.qtyDetail]: after.qtyDetail,
  });

  // Primary field(일시: Created Time)은 절대 전송하지 않음
  const txFields: Record<string, unknown> = {
    [TXN.worker]: [opts.workerRecordId],
    [TXN.lot]: [opts.lotRecordId],
    [TXN.bizDate]: seoulDateString(),
    [TXN.qty]: opts.receivedQty,
    [TXN.unit]: sanitizeSingleSelectValue(baseU),
    [TXN.io]: "입고",
    [TXN.status]: txnStatusInbound(),
  };

  const tbl = txnTable();
  if (!tbl) return { id: "" };
  return createAirtableRecord(tbl, txFields);
}

