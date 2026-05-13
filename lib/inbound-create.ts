import { createAirtableRecord, getAirtableRecord, tablePathSegment } from "@/lib/airtable";
import {
  AIRTABLE_TABLE,
  LOT_FIELDS,
  PRODUCT_FIELDS,
} from "@/lib/airtable-schema";
import { asNumber } from "@/lib/lot-inventory";
import { generateUniqueLotNumber } from "@/lib/lot-sequence";
import {
  DEFAULT_TXN_TABLE,
  TXN,
  sanitizeSingleSelectValue,
  txnStatusInbound,
} from "@/lib/txn-schema";

function lotTable(): string {
  return tablePathSegment(
    process.env.AIRTABLE_LOT_TABLE?.trim() ?? AIRTABLE_TABLE.lots
  );
}

function productTable(): string {
  return tablePathSegment(
    process.env.AIRTABLE_PRODUCTS_TABLE?.trim() ?? AIRTABLE_TABLE.products
  );
}

/** 입출고 내역 테이블이 삭제된 경우 null 반환 → 쓰기 skip */
function txnTable(): string | null {
  const v = process.env.AIRTABLE_TXN_TABLE?.trim();
  if (!v) return null;
  return tablePathSegment(v);
}

function assertRecordId(id: string, label: string) {
  if (!/^rec[0-9A-Za-z]+$/.test(id)) {
    throw new Error(`${label} is not a valid Airtable record id`);
  }
}

type CreateInboundArgs = {
  workerRecordId: string;
  productRecordId?: string;
  /** 수동 입력 품목명 (productRecordId 가 없을 때만 사용) */
  productNameManual?: string;
  bizDate: string; // YYYY-MM-DD
  specInput: string;
  misuInput: string;
  qtyBoxes: number;
  /** 선택, 정수(원 단위 등). 없으면 Airtable 필드 생략 */
  purchasePrice?: number;
  /** 선택, LOT·입출고 동시 저장 */
  memo?: string;
};

/** 서울 시간(KST=UTC+9) 기준 영업일(오전 9시 이전이면 전날). */
function getBizDateSeoul(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  if (kst.getUTCHours() < 9) {
    kst.setUTCDate(kst.getUTCDate() - 1);
  }
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * LOT번호 조합: YYMMDD-품목코드-규격-[미수숫자-]전체일련번호(4자리)
 * 미수의 "미" 글자를 제거하고, 빈 값이면 세그먼트 생략.
 */
function buildLotNumber(opts: {
  bizDate: string;
  productCode: string;
  spec: string;
  misu: string;
  seq: number;
}): string {
  const yymmdd = opts.bizDate.replace(/-/g, "").slice(2);
  const seqStr = String(opts.seq).padStart(4, "0");
  const misuClean = opts.misu.replace(/미$/, "").trim();
  const parts: string[] = [yymmdd, opts.productCode || "NOCODE", opts.spec || "-"];
  if (misuClean) parts.push(misuClean);
  parts.push(seqStr);
  return parts.join("-");
}

/** 새 LOT 생성 + 입고 트랜잭션 기록 */
export async function createInboundLotAndTxn(
  args: CreateInboundArgs
): Promise<{ lotId: string; lotNumber: string; txnId: string }> {
  const {
    workerRecordId,
    productRecordId,
    productNameManual,
    bizDate,
    specInput,
    misuInput,
    qtyBoxes,
    purchasePrice,
    memo,
  } = args;

  assertRecordId(workerRecordId, "workerRecordId");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(bizDate)) {
    throw new Error("bizDate must be YYYY-MM-DD");
  }
  if (!Number.isFinite(qtyBoxes) || qtyBoxes <= 0) {
    throw new Error("qtyBoxes must be a positive number");
  }

  let resolvedProductId = productRecordId?.trim() || "";
  let name = "";
  let productCode = "";
  let baseSpec = "";
  let baseDetailSpec = "";
  let baseUnit = "";

  if (resolvedProductId) {
    assertRecordId(resolvedProductId, "productRecordId");
    const productRec = await getAirtableRecord(productTable(), resolvedProductId);
    const pf = productRec.fields;
    name = String(pf[PRODUCT_FIELDS.name] ?? "").trim();
    if (!name) throw new Error("Product name is empty");
    productCode = String(pf["품목코드"] ?? "").trim();
    baseSpec = String(pf[PRODUCT_FIELDS.spec] ?? "").trim();
    baseDetailSpec = String(pf[PRODUCT_FIELDS.detailSpec] ?? "").trim();
    baseUnit = String(pf[PRODUCT_FIELDS.baseUnit] ?? "").trim();
  } else {
    name = (productNameManual ?? "").trim();
    if (!name) throw new Error("Product name is required");
    baseSpec = specInput.trim();
    baseDetailSpec = misuInput.trim();
    baseUnit = "박스";
    const created = await createAirtableRecord(productTable(), {
      [PRODUCT_FIELDS.name]: name,
      [PRODUCT_FIELDS.spec]: baseSpec,
      [PRODUCT_FIELDS.detailSpec]: baseDetailSpec,
      [PRODUCT_FIELDS.baseUnit]: baseUnit,
    });
    resolvedProductId = created.id;
  }

  const effectiveMisu = misuInput.trim() || baseDetailSpec;
  const effectiveSpec = specInput.trim() || baseSpec;

  const lotsPath = lotTable();
  const lotBizDate = getBizDateSeoul();
  const lotNumber = await generateUniqueLotNumber((seq) =>
    buildLotNumber({
      bizDate: lotBizDate,
      productCode,
      spec: effectiveSpec,
      misu: effectiveMisu,
      seq,
    }),
  );

  const lotFields: Record<string, unknown> = {
    [LOT_FIELDS.lotNumber]: lotNumber,
    [LOT_FIELDS.productLink]: [resolvedProductId],
    [LOT_FIELDS.stockQty]: qtyBoxes,
  };

  if (
    purchasePrice != null &&
    Number.isFinite(purchasePrice) &&
    purchasePrice >= 0
  ) {
    lotFields[LOT_FIELDS.purchasePrice] = purchasePrice;
  }
  const memoTrimmed = (memo ?? "").trim();
  if (memoTrimmed) {
    lotFields[LOT_FIELDS.memo] = memoTrimmed;
  }

  const lotCreated = await createAirtableRecord(lotsPath, lotFields);
  const lotId = lotCreated.id;

  const txFields: Record<string, unknown> = {
    [TXN.io]: "입고",
    [TXN.worker]: [workerRecordId],
    [TXN.lot]: [lotId],
    [TXN.bizDate]: bizDate,
    [TXN.qty]: qtyBoxes,
    [TXN.unit]: sanitizeSingleSelectValue(baseUnit || "박스"),
    [TXN.status]: txnStatusInbound(),
  };

  if (
    purchasePrice != null &&
    Number.isFinite(purchasePrice) &&
    purchasePrice >= 0
  ) {
    txFields[TXN.purchasePrice] = purchasePrice;
  }
  if (memoTrimmed) {
    txFields[TXN.memo] = memoTrimmed;
  }

  const tbl = txnTable();
  const txnId = tbl
    ? (await createAirtableRecord(tbl, txFields)).id
    : null;

  return { lotId, lotNumber, txnId: txnId ?? "" };
}

