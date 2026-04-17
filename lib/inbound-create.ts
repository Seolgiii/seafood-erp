import { createAirtableRecord, getAirtableRecord, tablePathSegment } from "@/lib/airtable";
import {
  AIRTABLE_TABLE,
  LOT_FIELDS,
  PRODUCT_FIELDS,
} from "@/lib/airtable-schema";
import { asNumber } from "@/lib/lot-inventory";
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

/**
 * LOT 번호 고유 접미사 생성: HHmmss(6자리) + 랜덤 3자리
 *
 * Airtable 읽기 없이 서버 생성 시점 기준으로만 만들어 경쟁 조건을 제거한다.
 * 같은 초에 두 요청이 동시에 들어오더라도 랜덤 3자리(0~999)가 다를 확률이 99.9%이며,
 * 추가로 호출자가 재시도하면 충분히 고유성이 보장된다.
 *
 * 예시: "143052_047" → 14시 30분 52초, 랜덤 047
 */
function generateLotSuffix(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const rand = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
  return `${hh}${mm}${ss}_${rand}`;
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
  let baseSpec = "";
  let baseDetailSpec = "";
  let baseUnit = "";
  let detailUnit = "";
  let R: number | null = null;

  if (resolvedProductId) {
    assertRecordId(resolvedProductId, "productRecordId");
    const productRec = await getAirtableRecord(productTable(), resolvedProductId);
    const pf = productRec.fields;
    name = String(pf[PRODUCT_FIELDS.name] ?? "").trim();
    if (!name) throw new Error("Product name is empty");
    baseSpec = String(pf[PRODUCT_FIELDS.spec] ?? "").trim();
    baseDetailSpec = String(pf[PRODUCT_FIELDS.detailSpec] ?? "").trim();
    baseUnit = String(pf[PRODUCT_FIELDS.baseUnit] ?? "").trim();
    detailUnit = String(pf[PRODUCT_FIELDS.detailUnit] ?? "").trim();
    const ratio = asNumber(pf[PRODUCT_FIELDS.detailPerBase]);
    R = ratio != null && ratio > 1 ? ratio : null;
  } else {
    name = (productNameManual ?? "").trim();
    if (!name) throw new Error("Product name is required");
    baseSpec = specInput.trim();
    baseDetailSpec = misuInput.trim();
    baseUnit = "박스";
    detailUnit = "";
    R = null;
    const created = await createAirtableRecord(productTable(), {
      [PRODUCT_FIELDS.name]: name,
      [PRODUCT_FIELDS.spec]: baseSpec,
      [PRODUCT_FIELDS.detailSpec]: baseDetailSpec,
      [PRODUCT_FIELDS.baseUnit]: baseUnit,
      [PRODUCT_FIELDS.detailUnit]: detailUnit,
    });
    resolvedProductId = created.id;
  }

  const effectiveMisu = misuInput.trim() || baseDetailSpec;

  // YYMMDD-품목명-미수-HHmmss_RRR
  const yyyymmdd = bizDate.replace(/-/g, "");
  const yymmdd = yyyymmdd.slice(2); // 앞의 20 제거
  const prefix = `${yymmdd}-${name}-${effectiveMisu}`;
  const lotsPath = lotTable();
  const lotNumber = `${prefix}-${generateLotSuffix()}`;

  const qtyBase = qtyBoxes;
  const qtyDetail =
    R != null && baseUnit && detailUnit ? qtyBoxes * R : 0;

  const lotFields: Record<string, unknown> = {
    [LOT_FIELDS.lotNumber]: lotNumber,
    [LOT_FIELDS.productLink]: [resolvedProductId],
    [LOT_FIELDS.qtyBase]: qtyBase,
    [LOT_FIELDS.qtyDetail]: qtyDetail,
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

