import {
  fetchAirtable,
  getAirtableRecord,
  patchAirtableRecord,
  tablePathSegment,
} from "@/lib/airtable";
import {
  AIRTABLE_TABLE,
  LOT_FIELDS,
  PRODUCT_FIELDS,
  WORKER_FIELDS,
} from "@/lib/airtable-schema";
import { asNumber } from "@/lib/lot-inventory";
import { formatSpecKgMisu } from "@/lib/spec-display";
import { computeLotStockAfterOutbound } from "@/lib/stock-deduction";
import type { N8nOutboundPayload, PendingTxnRow } from "@/lib/approval-types";
import {
  DEFAULT_TXN_TABLE,
  TXN,
  txnStatusApproved,
  txnStatusCompleted,
  txnStatusPending,
} from "@/lib/txn-schema";

const LOT = LOT_FIELDS;
const PR = PRODUCT_FIELDS;

/** 입출고 내역 테이블이 삭제된 경우 null 반환 */
function txnTable(): string | null {
  const v = process.env.AIRTABLE_TXN_TABLE?.trim();
  if (!v) return null;
  return tablePathSegment(v);
}

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

function workersTable(): string {
  return tablePathSegment(
    process.env.AIRTABLE_WORKERS_TABLE?.trim() ?? AIRTABLE_TABLE.workers
  );
}

type AirtableRecord<T> = { id: string; fields: T };

function escapeFormulaString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function firstLinkedId(raw: unknown): string | null {
  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === "string") {
    return raw[0];
  }
  if (typeof raw === "string" && raw.startsWith("rec")) return raw;
  return null;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function orRecordIds(ids: string[]): string {
  return ids.map((id) => `RECORD_ID()="${escapeFormulaString(id)}"`).join(",");
}

/** LOT 테이블에 박스 잔여를 따로 두는 경우(수동 숫자 필드만 PATCH). Formula/Lookup이면 비워 두세요. */
function optionalLotRemainingFieldName(): string | null {
  const fromEnv = process.env.AIRTABLE_LOT_REMAINING_QTY_FIELD?.trim();
  if (fromEnv) return fromEnv;
  return null;
}

function buildLotInventoryPatch(
  afterBase: number,
  afterDetail: number
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    [LOT.qtyBase]: afterBase,
    [LOT.qtyDetail]: afterDetail,
  };
  const rem = optionalLotRemainingFieldName();
  if (rem) {
    patch[rem] = afterBase;
  }
  return patch;
}

async function fetchRecordsByIds(
  tablePath: string,
  ids: string[],
  fieldNames: string[]
): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>();
  if (!ids.length) return map;
  const fieldsQs = fieldNames
    .map((f) => `fields[]=${encodeURIComponent(f)}`)
    .join("&");
  for (const batch of chunk([...new Set(ids)], 40)) {
    const formula = encodeURIComponent(`OR(${orRecordIds(batch)})`);
    const path = `${tablePath}?filterByFormula=${formula}&${fieldsQs}&pageSize=100`;
    const data = await fetchAirtable(path);
    const rows: AirtableRecord<Record<string, unknown>>[] = data.records ?? [];
    for (const r of rows) {
      map.set(r.id, r.fields);
    }
  }
  return map;
}

export async function listPendingOutboundRows(): Promise<PendingTxnRow[]> {
  const tbl = txnTable();
  if (!tbl) return [];
  const st = TXN.status;
  const pending = escapeFormulaString(txnStatusPending());
  const filter = encodeURIComponent(`{${st}}="${pending}"`);
  const need = [
    TXN.worker,
    TXN.date,
    TXN.bizDate,
    TXN.lot,
    TXN.qty,
    TXN.unit,
    TXN.status,
    TXN.yieldVar,
  ] as const;
  const fieldsQs = need.map((f) => `fields[]=${encodeURIComponent(f)}`).join("&");
  const path = `${tbl}?filterByFormula=${filter}&${fieldsQs}&pageSize=100`;
  const data = await fetchAirtable(path);
  const records: AirtableRecord<Record<string, unknown>>[] = data.records ?? [];

  const workerIds: string[] = [];
  const lotIds: string[] = [];
  for (const r of records) {
    const w = firstLinkedId(r.fields[TXN.worker]);
    const l = firstLinkedId(r.fields[TXN.lot]);
    if (w) workerIds.push(w);
    if (l) lotIds.push(l);
  }

  const workers = await fetchRecordsByIds(workersTable(), workerIds, [
    WORKER_FIELDS.name,
  ]);
  const lots = await fetchRecordsByIds(lotTable(), lotIds, [
    LOT.lotNumber,
    LOT.productLink,
  ]);

  const productIds: string[] = [];
  for (const lid of lotIds) {
    const f = lots.get(lid);
    if (!f) continue;
    const p = firstLinkedId(f[LOT.productLink]);
    if (p) productIds.push(p);
  }

  const products = await fetchRecordsByIds(productTable(), productIds, [
    PR.name,
    PR.spec,
    PR.detailSpec,
    PR.baseUnit,
    PR.detailUnit,
    PR.detailPerBase,
  ]);

  return records.map((r) => {
    const f = r.fields;
    const wId = firstLinkedId(f[TXN.worker]);
    const lId = firstLinkedId(f[TXN.lot]);
    const wf = wId ? workers.get(wId) : undefined;
    const lf = lId ? lots.get(lId) : undefined;
    const pId = lf ? firstLinkedId(lf[LOT.productLink]) : null;
    const pf = pId ? products.get(pId) : undefined;

    const ratio = asNumber(pf?.[PR.detailPerBase]);
    return {
      id: r.id,
      date: String(f[TXN.bizDate] ?? f[TXN.date] ?? ""),
      requestedQty: asNumber(f[TXN.qty]) ?? 0,
      unit: String(f[TXN.unit] ?? "").trim(),
      yieldVarianceDetail: asNumber(f[TXN.yieldVar]) ?? 0,
      workerId: wId,
      workerName: String(wf?.[WORKER_FIELDS.name] ?? "").trim() || "-",
      lotId: lId,
      lotNumber: String(lf?.[LOT.lotNumber] ?? "").trim() || "-",
      productId: pId,
      productName: String(pf?.[PR.name] ?? "").trim() || "-",
      spec: String(pf?.[PR.spec] ?? "").trim() || "-",
      detailSpec: String(pf?.[PR.detailSpec] ?? "").trim(),
      baseUnitLabel: String(pf?.[PR.baseUnit] ?? "").trim(),
      detailUnitLabel: String(pf?.[PR.detailUnit] ?? "").trim(),
      detailPerBase: ratio != null && ratio > 0 ? ratio : null,
    };
  });
}

function buildN8nPayload(
  row: PendingTxnRow,
  before: { base: number; detail: number },
  after: { base: number; detail: number },
  txnStatusLabel: string
): N8nOutboundPayload {
  const specText = formatSpecKgMisu(row.spec, row.detailSpec);
  const unitText = row.unit;
  return {
    event: "outbound_approved",
    approvedAt: new Date().toISOString(),
    specText,
    unitText,
    transaction: {
      id: row.id,
      date: row.date,
      requestedQty: row.requestedQty,
      unit: row.unit,
      status: txnStatusLabel,
      yieldVarianceDetail: row.yieldVarianceDetail,
    },
    product: {
      id: row.productId,
      name: row.productName,
      spec: row.spec,
      unitBase: row.baseUnitLabel,
      unitDetail: row.detailUnitLabel,
      detailPerBase: row.detailPerBase,
    },
    worker: {
      id: row.workerId,
      name: row.workerName,
    },
    lot: {
      id: row.lotId,
      lotNumber: row.lotNumber,
    },
    inventory: {
      before,
      after,
    },
  };
}

export async function approveOutboundTransaction(
  transactionId: string
): Promise<{
  ok: true;
  n8nPosted: boolean;
  alreadyApproved?: boolean;
}> {
  const pendingLabel = txnStatusPending();
  const approvedLabel = txnStatusApproved();
  const completedLabel = txnStatusCompleted();
  const txTbl = txnTable();
  if (!txTbl) throw new Error("입출고 내역 테이블이 설정되지 않았습니다 (AIRTABLE_TXN_TABLE)");
  const record = await getAirtableRecord(txTbl, transactionId);
  const tf = record.fields;

  const status = String(tf[TXN.status] ?? "").trim();
  if (status === approvedLabel || status === completedLabel) {
    return { ok: true, n8nPosted: false, alreadyApproved: true };
  }
  if (status !== pendingLabel) {
    throw new Error("Not pending");
  }

  const lotId = firstLinkedId(tf[TXN.lot]);
  if (!lotId) throw new Error("Missing LOT link");

  const qty = asNumber(tf[TXN.qty]);
  if (qty == null || qty <= 0) throw new Error("Invalid qty");

  const unit = String(tf[TXN.unit] ?? "").trim();
  if (!unit) throw new Error("Missing unit");

  const yieldV = asNumber(tf[TXN.yieldVar]) ?? 0;

  const lotPath = lotTable();
  const lotRec = await getAirtableRecord(lotPath, lotId);
  const lf = lotRec.fields;

  const productId = firstLinkedId(lf[LOT.productLink]);
  if (!productId) throw new Error("Missing product on LOT");

  const prodPath = productTable();
  const prRec = await getAirtableRecord(prodPath, productId);
  const pf = prRec.fields;

  const productName = String(pf[PR.name] ?? "").trim();
  const category = String(pf[PR.category] ?? "").trim();
  const spec = String(pf[PR.spec] ?? "").trim();
  const detailSpec = String(pf[PR.detailSpec] ?? "").trim();
  const baseU = String(pf[PR.baseUnit] ?? "").trim();
  const detailU = String(pf[PR.detailUnit] ?? "").trim();
  const ratio = asNumber(pf[PR.detailPerBase]);
  const R = ratio != null && ratio > 0 ? ratio : null;

  const B0 = asNumber(lf[LOT.qtyBase]) ?? 0;
  const D0 = asNumber(lf[LOT.qtyDetail]) ?? 0;

  const workerId = firstLinkedId(tf[TXN.worker]);
  let workerName = "-";
  if (workerId) {
    const wr = await getAirtableRecord(workersTable(), workerId);
    workerName =
      String(wr.fields[WORKER_FIELDS.name] ?? "").trim() || "-";
  }

  const row: PendingTxnRow = {
    id: transactionId,
    date: String(tf[TXN.bizDate] ?? tf[TXN.date] ?? ""),
    requestedQty: qty,
    unit,
    yieldVarianceDetail: yieldV,
    workerId,
    workerName,
    lotId,
    lotNumber: String(lf[LOT.lotNumber] ?? "").trim() || "-",
    productId,
    productName: productName || "-",
    spec: spec || "-",
    detailSpec,
    baseUnitLabel: baseU,
    detailUnitLabel: detailU,
    detailPerBase: R,
  };

  // 품목 구분: 품목 마스터 `품목 구분`에 '원물'/'가공' 포함 여부 우선, 없으면 기준1당_상세수량 유무로 추정
  const isRawByCategory = category.includes("원물");
  const isProcessedByCategory = category.includes("가공");
  const isRaw = isRawByCategory || (!isProcessedByCategory && R == null);

  // 재고 초과 출고 방지 (PATCH 전 검증)
  if (isRaw) {
    if (unit !== baseU) {
      throw new Error(`원물 출고 단위가 올바르지 않습니다: ${baseU} 단위만 허용`);
    }
    if (qty > B0) {
      throw new Error("재고가 부족합니다");
    }
  } else {
    /**
     * 가공품(PBO) 스켈레톤: 상세 단위 공간에서의 총 차감량을 계산한 뒤 허용 재고와 비교.
     * - 상세 단위로 출고: detailRemoved = qty + 수율오차
     * - 기준(박스) 단위로 출고: detailRemoved = qty × R + 수율오차 (R = 기준1당_상세수량)
     * 실제 LOT 반영은 아래 `computeLotStockAfterOutbound`가 동일한 규칙으로 수행.
     */
    const detailOut =
      unit === detailU
        ? qty + yieldV
        : unit === baseU && R != null
          ? qty * R + yieldV
          : qty + yieldV;
    const canonicalBefore = (R ?? 0) * B0 + D0;
    if (detailOut > canonicalBefore + 1e-9) {
      throw new Error("재고가 부족합니다");
    }
  }

  const after = computeLotStockAfterOutbound({
    qtyBase: B0,
    qtyDetail: D0,
    requestedQty: qty,
    requestUnit: unit,
    yieldVarianceDetail: yieldV,
    productBaseUnit: baseU,
    productDetailUnit: detailU,
    detailPerBase: R,
  });

  const lotPatch = buildLotInventoryPatch(after.qtyBase, after.qtyDetail);
  const lotRollback = buildLotInventoryPatch(B0, D0);

  let lotPatched = false;
  try {
    await patchAirtableRecord(lotPath, lotId, lotPatch);
    lotPatched = true;
    await patchAirtableRecord(txTbl!, transactionId, {
      [TXN.status]: completedLabel,
    });
  } catch (e) {
    if (lotPatched) {
      try {
        await patchAirtableRecord(lotPath, lotId, lotRollback);
      } catch (rollbackErr) {
        console.error(
          "[approveOutboundTransaction] LOT 재고 롤백 실패 — 수동 정합 확인 필요",
          rollbackErr
        );
      }
    }
    throw e;
  }

  const webhook = process.env.N8N_APPROVAL_WEBHOOK_URL?.trim();
  const payload = buildN8nPayload(
    row,
    { base: B0, detail: D0 },
    {
      base: after.qtyBase,
      detail: after.qtyDetail,
    },
    completedLabel
  );

  let n8nPosted = false;
  if (webhook) {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`n8n webhook failed ${res.status}: ${t}`);
    }
    n8nPosted = true;
  }

  return { ok: true, n8nPosted, alreadyApproved: false };
}

export type { PendingTxnRow, N8nOutboundPayload } from "@/lib/approval-types";
