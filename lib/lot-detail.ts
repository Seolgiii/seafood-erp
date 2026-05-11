import "server-only";
import { fetchAirtable, tablePathSegment } from "@/lib/airtable";
import {
  AIRTABLE_TABLE,
  LOT_FIELDS,
  PRODUCT_FIELDS,
  WORKER_FIELDS,
} from "@/lib/airtable-schema";
import {
  InboundFieldsSchema,
  LotFieldsSchema,
  reportSchemaIssue,
} from "@/lib/schemas";
import { daysBetween } from "@/lib/cost-calc";

export type LotDetail = {
  lotRecordId: string;
  lotNumber: string;
  productName: string;
  spec: string;
  detailSpec: string;
  storage: string;
  stockQty: number;
  initialQty: number;
  inboundDate: string;
  daysSinceInbound: number;
  supplier: string;
  purchaser: string;
  shipName: string;
};

function escapeFormulaString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function firstLinkedId(raw: unknown): string | null {
  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === "string") {
    return raw[0];
  }
  if (typeof raw === "string" && raw.startsWith("rec")) return raw;
  return null;
}

function asString(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return String(v[0] ?? "").trim();
  return String(v).trim();
}

function asNumber(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = Array.isArray(v) ? Number(v[0]) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function lotTablePath(): string {
  return tablePathSegment(
    process.env.AIRTABLE_LOT_TABLE?.trim() ?? AIRTABLE_TABLE.lots,
  );
}

function inboundTablePath(): string {
  return tablePathSegment(
    process.env.AIRTABLE_INBOUND_TABLE?.trim() ?? "입고 관리",
  );
}

function productTablePath(): string {
  return tablePathSegment(
    process.env.AIRTABLE_PRODUCTS_TABLE?.trim() ?? AIRTABLE_TABLE.products,
  );
}

function workerTablePath(): string {
  return tablePathSegment(
    process.env.AIRTABLE_WORKERS_TABLE?.trim() ?? AIRTABLE_TABLE.workers,
  );
}

function supplierTablePath(): string {
  return tablePathSegment(
    process.env.AIRTABLE_SUPPLIERS_TABLE?.trim() ?? AIRTABLE_TABLE.suppliers,
  );
}

function storageMasterTablePath(): string {
  return tablePathSegment(
    process.env.AIRTABLE_STORAGES_TABLE?.trim() ?? "보관처 마스터",
  );
}

function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * LOT번호로 상세 정보를 조회한다.
 *
 * LOT별 재고 → 입고 관리 → (작업자 / 매입처 마스터 / 보관처 마스터 / 품목 마스터)
 * 까지 코드 join. 잔여수량·매입자·선박명은 입고 관리에서만 존재 (LOT엔 매입처 link만).
 *
 * LOT엔 있는 정보(보관처/매입처 link)는 LOT 우선 사용, 없으면 입고 관리 fallback.
 */
export async function fetchLotDetailByNumber(
  lotNumber: string,
): Promise<LotDetail | null> {
  const trimmed = String(lotNumber ?? "").trim();
  if (!trimmed) return null;

  const formula = encodeURIComponent(
    `{${LOT_FIELDS.lotNumber}}='${escapeFormulaString(trimmed)}'`,
  );
  const lotData = await fetchAirtable(
    `${lotTablePath()}?filterByFormula=${formula}&maxRecords=1`,
  );
  const lotRec = (lotData.records ?? [])[0] as
    | { id: string; fields?: Record<string, unknown> }
    | undefined;
  if (!lotRec) return null;

  const lotFields = (lotRec.fields ?? {}) as Record<string, unknown>;
  const parsed = LotFieldsSchema.safeParse(lotFields);
  if (!parsed.success) {
    reportSchemaIssue("fetchLotDetailByNumber.lot", lotRec.id, parsed.error);
  }

  const productLinkId = firstLinkedId(lotFields[LOT_FIELDS.productLink]);
  const inboundLinkId = firstLinkedId(lotFields["입고관리링크"]);
  const lotStorageId = firstLinkedId(lotFields[LOT_FIELDS.storage]);
  const lotSupplierId = firstLinkedId(lotFields["매입처"]);

  const [
    inboundFields,
    productFields,
    lotStorageName,
    lotSupplierName,
  ] = await Promise.all([
    inboundLinkId ? fetchInboundFields(inboundLinkId) : Promise.resolve(null),
    productLinkId ? fetchProductFields(productLinkId) : Promise.resolve(null),
    lotStorageId ? fetchStorageName(lotStorageId) : Promise.resolve(""),
    lotSupplierId ? fetchSupplierName(lotSupplierId) : Promise.resolve(""),
  ]);

  let purchaserName = "";
  let shipName = "";
  let inboundStorageName = "";
  let inboundSupplierName = "";
  let inboundQty = 0;
  let inboundDate = asString(lotFields[LOT_FIELDS.inboundDate]);

  if (inboundFields) {
    shipName = asString(inboundFields["선박명"]);
    inboundQty =
      asNumber(inboundFields["입고수량"]) ||
      asNumber(inboundFields["입고수량(BOX)"]);
    inboundDate =
      asString(inboundFields["입고일"]) ||
      asString(inboundFields["입고일자"]) ||
      inboundDate;

    const purchaserId = firstLinkedId(inboundFields["매입자"]);
    const inboundStorageId = firstLinkedId(inboundFields["보관처"]);
    const inboundSupplierId = firstLinkedId(inboundFields["매입처"]);

    const [pName, iStorage, iSupplier] = await Promise.all([
      purchaserId ? fetchWorkerName(purchaserId) : Promise.resolve(""),
      !lotStorageName && inboundStorageId
        ? fetchStorageName(inboundStorageId)
        : Promise.resolve(""),
      !lotSupplierName && inboundSupplierId
        ? fetchSupplierName(inboundSupplierId)
        : Promise.resolve(""),
    ]);
    purchaserName = pName;
    inboundStorageName = iStorage;
    inboundSupplierName = iSupplier;
  }

  const initialQty = asNumber(lotFields["입고수량(BOX)"]) || inboundQty;
  const stockQty =
    asNumber(lotFields["재고수량"]) || asNumber(lotFields[LOT_FIELDS.qtyBase]);
  const productName =
    asString(productFields?.[PRODUCT_FIELDS.name]) ||
    asString(lotFields["품목명"]);
  const spec =
    asString(lotFields[LOT_FIELDS.spec]) ||
    asString(productFields?.[PRODUCT_FIELDS.spec]) ||
    asString(lotFields["규격"]);
  const detailSpec =
    asString(lotFields[LOT_FIELDS.detailSpec]) ||
    asString(productFields?.[PRODUCT_FIELDS.detailSpec]) ||
    asString(lotFields["미수"]);

  return {
    lotRecordId: lotRec.id,
    lotNumber: asString(lotFields[LOT_FIELDS.lotNumber]) || trimmed,
    productName,
    spec,
    detailSpec,
    storage: lotStorageName || inboundStorageName,
    stockQty,
    initialQty,
    inboundDate,
    daysSinceInbound: inboundDate ? daysBetween(inboundDate, todayKST()) : 0,
    supplier: lotSupplierName || inboundSupplierName,
    purchaser: purchaserName,
    shipName,
  };
}

async function fetchInboundFields(
  id: string,
): Promise<Record<string, unknown> | null> {
  try {
    const data = await fetchAirtable(`${inboundTablePath()}/${id}`);
    const fields = (data.fields ?? {}) as Record<string, unknown>;
    const parsed = InboundFieldsSchema.safeParse(fields);
    if (!parsed.success) {
      reportSchemaIssue("fetchLotDetailByNumber.inbound", id, parsed.error);
    }
    return fields;
  } catch {
    return null;
  }
}

async function fetchProductFields(
  id: string,
): Promise<Record<string, unknown> | null> {
  try {
    const data = await fetchAirtable(`${productTablePath()}/${id}`);
    return (data.fields ?? {}) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function fetchWorkerName(id: string): Promise<string> {
  try {
    const data = await fetchAirtable(`${workerTablePath()}/${id}`);
    return asString(data.fields?.[WORKER_FIELDS.name]);
  } catch {
    return "";
  }
}

async function fetchStorageName(id: string): Promise<string> {
  try {
    const data = await fetchAirtable(`${storageMasterTablePath()}/${id}`);
    return asString(data.fields?.["보관처명"]);
  } catch {
    return "";
  }
}

async function fetchSupplierName(id: string): Promise<string> {
  try {
    const data = await fetchAirtable(`${supplierTablePath()}/${id}`);
    return asString(data.fields?.["매입처명"]);
  } catch {
    return "";
  }
}
