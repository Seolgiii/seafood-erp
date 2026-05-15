"use server";
import { log, logError, logWarn } from '@/lib/logger';

import { revalidatePath } from "next/cache";
import { getStorageCostForLot } from "@/lib/storage-cost";
import { AuthError, requireWorker } from "@/lib/server-auth";
import { calculateTransferPricing } from "@/lib/cost-calc";
import { generateUniqueLotNumber } from "@/lib/lot-sequence";
import { TransferFieldsSchema, reportSchemaIssue } from "@/lib/schemas";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

function isRecordId(id: string): boolean {
  return /^rec[a-zA-Z0-9]+$/.test(id);
}

const num = (v: unknown) => Number(Array.isArray(v) ? v[0] : v) || 0;

function firstLink(v: unknown): string | null {
  if (Array.isArray(v) && v.length > 0) {
    const s = String(v[0]);
    if (/^rec[a-zA-Z0-9]+$/.test(s)) return s;
  }
  return null;
}

async function fetchRecord(
  tableName: string,
  recordId: string,
): Promise<Record<string, unknown> | null> {
  const res = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}/${recordId}`,
    { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }, next: { revalidate: 0 } },
  );
  if (!res.ok) {
    logError(`[transfer fetchRecord] ${tableName}/${recordId} 실패:`, res.status);
    return null;
  }
  const data = await res.json();
  return (data.fields as Record<string, unknown>) ?? null;
}

async function listRecords(
  tableName: string,
): Promise<{ id: string; fields: Record<string, unknown> }[]> {
  const res = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}?pageSize=100`,
    { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }, next: { revalidate: 0 } },
  );
  if (!res.ok) {
    logError(`[transfer listRecords] ${tableName} 실패:`, res.status);
    return [];
  }
  const data = await res.json();
  return (data.records as { id: string; fields: Record<string, unknown> }[]) ?? [];
}

async function patchRecord(
  tableName: string,
  recordId: string,
  fields: Record<string, unknown>,
): Promise<boolean> {
  const res = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}/${recordId}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logError(`[transfer patchRecord] ${tableName}/${recordId} 실패:`, res.status, body);
  }
  return res.ok;
}

async function createRecord(
  tableName: string,
  fields: Record<string, unknown>,
): Promise<{ id: string; fields: Record<string, unknown> } | null> {
  const res = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logError(`[transfer createRecord] ${tableName} 실패:`, res.status, body);
    return null;
  }
  return await res.json();
}

async function createRecordOrThrow(
  tableName: string,
  fields: Record<string, unknown>,
): Promise<{ id: string; fields: Record<string, unknown> }> {
  const res = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logError(`[transfer createRecord] ${tableName} 실패:`, res.status, body);
    let detail = `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(body);
      detail = parsed.error?.message || parsed.message || parsed.error || detail;
    } catch {}
    throw new Error(`[${tableName}] ${detail}`);
  }
  return res.json();
}

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
  const parts = [yymmdd, opts.productCode || "NOCODE", opts.spec || "-"];
  if (misuClean) parts.push(misuClean);
  parts.push(seqStr);
  return parts.join("-");
}

async function resolveStorageName(storageId: string): Promise<string> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !isRecordId(storageId)) return "";
  const res = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent("보관처 마스터")}/${storageId}`,
    { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }, next: { revalidate: 300 } },
  );
  if (!res.ok) return "";
  return String((await res.json()).fields?.["보관처명"] ?? "");
}

export type TransferLotResult = {
  lotRecordId: string;
  lotNumber: string;
  productName: string;
  spec: string;
  misu: string;
  stockQty: number;
  storage: string;
  inboundRecordId: string;
};

/** 재고 이동 소스 LOT 검색 (재고수량 > 0 인 것만) */
export async function searchTransferLot(
  keyword: string,
): Promise<{ success: boolean; records: TransferLotResult[]; error?: string }> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) return { success: false, records: [], error: "환경변수 누락" };
  if (!keyword.trim()) return { success: true, records: [] };

  try {
    const escaped = keyword.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const formula = `AND({재고수량} > 0, OR(FIND('${escaped}', REGEX_EXTRACT({LOT번호}, '[0-9]+$')), FIND('${escaped}', {품목명})))`;
    const res = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent("LOT별 재고")}?filterByFormula=${encodeURIComponent(formula)}&pageSize=20`,
      { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }, next: { revalidate: 0 } },
    );
    if (!res.ok) return { success: false, records: [], error: `Airtable 오류 ${res.status}` };

    const data = await res.json();

    // 보관처 마스터 이름 맵 (1회 fetch, 5분 캐시)
    const masterRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent("보관처 마스터")}?fields[]=${encodeURIComponent("보관처명")}&pageSize=100`,
      { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }, next: { revalidate: 300 } },
    );
    const storageNameMap: Record<string, string> = {};
    if (masterRes.ok) {
      const masterData = await masterRes.json();
      for (const r of masterData.records ?? []) {
        storageNameMap[r.id] = String(r.fields?.["보관처명"] ?? "");
      }
    }

    const records: TransferLotResult[] = (data.records ?? []).map(
      (r: { id: string; fields?: Record<string, unknown> }) => {
        const f = r.fields ?? {};
        const storageId = firstLink(f["보관처"]);
        const productName = Array.isArray(f["품목명"])
          ? String(f["품목명"][0] ?? "")
          : String(f["품목명"] ?? "");
        const spec = Array.isArray(f["규격"]) ? String(f["규격"][0] ?? "") : String(f["규격"] ?? "");
        const misu = Array.isArray(f["미수"]) ? String(f["미수"][0] ?? "") : String(f["미수"] ?? "");
        return {
          lotRecordId: r.id,
          lotNumber: String(f["LOT번호"] ?? ""),
          productName,
          spec,
          misu,
          stockQty: num(f["재고수량"]),
          storage: storageId ? (storageNameMap[storageId] ?? "") : "",
          inboundRecordId: firstLink(f["입고관리링크"]) ?? "",
        };
      },
    );

    return { success: true, records };
  } catch (err) {
    logError("[searchTransferLot]", err);
    return { success: false, records: [], error: "검색 중 오류가 발생했습니다." };
  }
}

/** 재고 이동 신청 생성 */
export async function createTransferRecord(payload: {
  lotRecordId: string;
  이동수량: number;
  이동후보관처RecordId: string;
  이동일: string;
  workerId: string;
}): Promise<{ success: boolean; message?: string }> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) return { success: false, message: "환경변수 누락" };

  const { lotRecordId, 이동수량, 이동후보관처RecordId, 이동일, workerId } = payload;

  if (!isRecordId(lotRecordId)) return { success: false, message: "LOT 레코드 ID가 올바르지 않습니다." };
  if (!Number.isFinite(이동수량) || 이동수량 <= 0) return { success: false, message: "이동 수량을 올바르게 입력해주세요." };
  if (!isRecordId(이동후보관처RecordId)) return { success: false, message: "이동 후 보관처를 선택해주세요." };
  if (!이동일) return { success: false, message: "이동일을 입력해주세요." };

  // 작업자 권한 검증 (Airtable 조회 — 활성 작업자 확인)
  let verifiedWorkerId: string;
  try {
    const verified = await requireWorker(workerId);
    verifiedWorkerId = verified.id;
  } catch (e) {
    if (e instanceof AuthError) {
      logWarn("[createTransferRecord] 권한 거부:", e.code, e.message);
      return { success: false, message: e.message };
    }
    throw e;
  }

  try {
    // 현재 재고 확인
    const lotFields = await fetchRecord("LOT별 재고", lotRecordId);
    if (!lotFields) return { success: false, message: "LOT별 재고 레코드를 찾을 수 없습니다." };

    const currentStock = num(lotFields["재고수량"]);
    if (이동수량 > currentStock) {
      return { success: false, message: `재고 부족 (현재 잔여: ${currentStock}박스)` };
    }

    const fields: Record<string, unknown> = {
      "원본 LOT번호": [lotRecordId],
      "이동수량": 이동수량,
      "이동 후 보관처": [이동후보관처RecordId],
      "이동일": 이동일,
      "승인상태": "승인 대기",
    };
    fields["작업자"] = [verifiedWorkerId];
    const 이동전보관처Id = firstLink(lotFields["보관처"]);
    if (이동전보관처Id) fields["이동 전 보관처"] = [이동전보관처Id];

    const created = await createRecordOrThrow("재고 이동", fields);
    log("[createTransferRecord] 생성 완료:", created.id);

    revalidatePath("/my-requests");
    revalidatePath("/admin/dashboard");
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    logError("[createTransferRecord] 실패:", msg);
    return { success: false, message: msg };
  }
}

/**
 * 재고 이동 승인 처리 (admin.ts의 updateApprovalStatus에서 호출)
 *
 * 처리 순서:
 *  1. 재고 이동 레코드 조회
 *  2. 원본 LOT별 재고 조회 → 재고 부족 검사
 *  3. 원본 입고관리 조회 → 잔여수량 검사
 *  4. 판매원가 기준으로 새 LOT 수매가 계산
 *  5. 새 입고관리 레코드 생성 (비고="재고 이동", 승인상태="승인 완료")
 *  6. 새 LOT별 재고 레코드 생성 (새 LOT번호, 새 보관처 비용 적용)
 *  7. 원본 재고수량·잔여수량 차감
 *  8. 재고 이동 레코드에 신규 LOT 링크 업데이트
 */
export async function approveTransfer(
  transferRecordId: string,
): Promise<{ success: boolean; message?: string }> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) return { success: false, message: "환경변수 누락" };

  // 1. 재고 이동 레코드 조회
  const tfFields = await fetchRecord("재고 이동", transferRecordId);
  if (!tfFields) return { success: false, message: "재고 이동 레코드를 찾을 수 없습니다." };

  // zod 검증 (모니터링 모드)
  const tfParsed = TransferFieldsSchema.safeParse(tfFields);
  if (!tfParsed.success) {
    reportSchemaIssue(
      "approveTransfer:재고 이동",
      transferRecordId,
      tfParsed.error,
    );
  }

  // 중복 승인 방지
  if (String(tfFields["승인상태"] ?? "") === "승인 완료") return { success: true };

  const lotRecordId = firstLink(tfFields["원본 LOT번호"]);
  if (!lotRecordId) return { success: false, message: "원본 LOT번호 링크가 없습니다." };

  const 이동수량 = num(tfFields["이동수량"]);
  if (이동수량 <= 0) return { success: false, message: "이동수량이 올바르지 않습니다." };

  const 이동일 = String(tfFields["이동일"] ?? "").slice(0, 10) || new Date().toISOString().slice(0, 10);
  const newStorageId = firstLink(tfFields["이동 후 보관처"]);
  const workerId = firstLink(tfFields["작업자"]);

  // 2. 원본 LOT별 재고 조회
  const lotFields = await fetchRecord("LOT별 재고", lotRecordId);
  if (!lotFields) return { success: false, message: "LOT별 재고 레코드를 찾을 수 없습니다." };

  const currentStock = num(lotFields["재고수량"]);
  if (이동수량 > currentStock) {
    return { success: false, message: `재고 부족 (잔여: ${currentStock}박스, 이동: ${이동수량}박스)` };
  }

  const originalLotNumber = String(lotFields["LOT번호"] ?? "").trim();
  const inboundRecordId = firstLink(lotFields["입고관리링크"]);
  if (!inboundRecordId) return { success: false, message: "원본 LOT의 입고관리 링크가 없습니다." };

  // 3. 원본 입고관리 조회
  const inboundFields = await fetchRecord("입고 관리", inboundRecordId);
  if (!inboundFields) return { success: false, message: "입고 관리 레코드를 찾을 수 없습니다." };

  const currentRemain = num(inboundFields["잔여수량"]);
  if (이동수량 > currentRemain) {
    return { success: false, message: `잔여수량 부족 (잔여: ${currentRemain}박스, 이동: ${이동수량}박스)` };
  }

  // 4. C안 가격/이월 경비 산정 (+ 동결비 특례)
  //    새 수매가         = 원본 수매가 (박스당 그대로, 비례 X)
  //    새 이월X (총액)   = (원본 박스당 X + 원본 이월X / 입고박스수) × 이동박스수
  //    동결비 특례: 새 LOT.동결비 = 0 (아래 7단계에서 보관처 비용 이력 적용 시 skip)
  //                 이월동결비는 원본 동결비 cost basis를 박스당 단위로 보존
  const sourceInboxQty = num(lotFields["입고수량(BOX)"]);
  const pricing = calculateTransferPricing({
    purchasePrice: num(lotFields["수매가"]),
    refrigerationCostAccum: num(lotFields["누적냉장료"]),
    inOutFee: num(lotFields["입출고비"]),
    unionFee: num(lotFields["노조비"]),
    freezeCost: num(lotFields["동결비"]),
    carriedRefrigeration: num(lotFields["이월냉장료"]),
    carriedInOutFee: num(lotFields["이월입출고비"]),
    carriedUnionFee: num(lotFields["이월노조비"]),
    carriedFreezeFee: num(lotFields["이월동결비"]),
    sourceInboxQty,
    transferQty: 이동수량,
  });

  // 5. 새 LOT번호 (원본 날짜 prefix 유지, 새 일련번호)
  const lotParts = originalLotNumber.split("-");
  const yymmdd = lotParts[0] ?? "";
  const productCode = lotParts[1] ?? "NOCODE";
  const bizDate =
    yymmdd.length === 6
      ? `20${yymmdd.slice(0, 2)}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`
      : 이동일;

  const spec = String(inboundFields["규격"] ?? "").trim();
  const misu = String(inboundFields["미수"] ?? "").trim();
  const newLotNumber = await generateUniqueLotNumber((seq) =>
    buildLotNumber({ bizDate, productCode, spec, misu, seq }),
  );

  // 6. 새 입고관리 레코드 생성
  //    매입자/입고자/선박명 같은 매입 시점 정보는 원본에서 그대로 복사한다.
  //    작업자는 "이 레코드를 만든 사람"이므로 이동 처리자(workerId) 유지.
  const productMasterId = firstLink(inboundFields["품목마스터"]);
  const supplierId = firstLink(inboundFields["매입처"]);
  const purchaserId =
    firstLink(inboundFields["매입자"]) ?? firstLink(lotFields["매입자"]);
  const stockerId =
    firstLink(lotFields["입고자"]) ?? firstLink(inboundFields["작업자"]);
  const shipName = String(
    inboundFields["선박명"] ?? lotFields["선박명"] ?? "",
  ).trim();
  const originalRemark = String(lotFields["비고"] ?? "").trim();
  const 원산지 = String(
    inboundFields["원산지"] ?? lotFields["원산지"] ?? "",
  ).trim();

  const newInboundFields: Record<string, unknown> = {
    "입고일": 이동일,
    "규격": spec,
    "미수": misu,
    "입고수량": 이동수량,
    "잔여수량": 이동수량,
    "수매가": pricing.newPurchasePrice,
    "원산지": 원산지,
    "승인상태": "승인 완료",
    "비고": "재고 이동",
  };
  if (productMasterId) newInboundFields["품목마스터"] = [productMasterId];
  if (newStorageId) newInboundFields["보관처"] = [newStorageId];
  if (workerId) newInboundFields["작업자"] = [workerId];
  if (purchaserId) newInboundFields["매입자"] = [purchaserId];
  if (supplierId) newInboundFields["매입처"] = [supplierId];
  if (shipName) newInboundFields["선박명"] = shipName;

  const newInbound = await createRecord("입고 관리", newInboundFields);
  if (!newInbound?.id) return { success: false, message: "신규 입고 관리 레코드 생성 실패" };

  // LOT번호 별도 PATCH (생성 시 자동 채번이 필요하므로 분리)
  await patchRecord("입고 관리", newInbound.id, { "LOT번호": newLotNumber });

  // 7. 새 LOT별 재고 레코드 생성 (옵션 B)
  //    - 최초입고일: 원본 LOT에서 복사 (LOT 추적용, 변경 X)
  //    - 이동입고일: 이동일 (누적 경비 계산 기준일)
  //    - 이월 4개: 비례 분할로 이전 보관처 비용 분리 저장
  //    - 입출고비/노조비/동결비/냉장료단가: 새 보관처 비용 이력에서 조회
  const originalFirstInbound =
    String(lotFields["최초입고일"] ?? lotFields["입고일자"] ?? "").trim() || 이동일;

  const newStorageName = newStorageId ? await resolveStorageName(newStorageId) : "";
  // 품목명: 원본 LOT에 있으면 그대로, 없으면(재이동 케이스) 품목마스터에서 조회
  let productName = String(lotFields["품목명"] ?? "").trim();
  if (!productName && productMasterId) {
    const pmRec = await fetchRecord("품목마스터", productMasterId);
    productName = String(pmRec?.["품목명"] ?? "").trim();
  }

  const lotInventoryFields: Record<string, unknown> = {
    "LOT번호": newLotNumber,
    "입고관리링크": [newInbound.id],
    "재고수량": 이동수량,
    "입고수량(BOX)": 이동수량,
    "규격": spec,
    "미수": misu,
    "수매가": pricing.newPurchasePrice,
    ...(productMasterId && { "품목마스터": [productMasterId] }),
    ...(productName && { "품목명": productName }),
    ...(원산지 && { "원산지": 원산지 }),
    ...(supplierId && { "매입처": [supplierId] }),
    ...(purchaserId && { "매입자": [purchaserId] }),
    ...(stockerId && { "입고자": [stockerId] }),
    ...(shipName && { "선박명": shipName }),
    ...(originalRemark && { "비고": originalRemark }),
    "최초입고일": originalFirstInbound,
    "이동입고일": 이동일,
    "이월냉장료": pricing.newCarriedRefrigeration,
    "이월입출고비": pricing.newCarriedInOutFee,
    "이월노조비": pricing.newCarriedUnionFee,
    "이월동결비": pricing.newCarriedFreezeFee,
    "LOT번호(이동출처)": [lotRecordId],
  };
  if (newStorageId) lotInventoryFields["보관처"] = [newStorageId];

  if (newStorageName) {
    try {
      const cost = await getStorageCostForLot(newStorageName, 이동일);
      if (cost?.refrigerationFee != null) lotInventoryFields["냉장료단가"] = cost.refrigerationFee;
      if (cost?.inOutFee != null) lotInventoryFields["입출고비"] = cost.inOutFee;
      if (cost?.unionFee != null) lotInventoryFields["노조비"] = cost.unionFee;
      // 동결비 특례: 이동된 LOT은 이미 동결된 상태라 새 보관처에서 동결비 부과 X.
      // 원본 동결비 cost basis는 이월동결비(박스당 × 이동박스수)로 보존됨.
    } catch (e) {
      logWarn("[approveTransfer] 새 보관처 비용 조회 실패 (승인 계속 진행):", e);
    }
  }

  const newLot = await createRecord("LOT별 재고", lotInventoryFields);
  if (!newLot?.id) return { success: false, message: "신규 LOT별 재고 레코드 생성 실패" };

  // 8. 원본 재고 차감
  await Promise.all([
    patchRecord("LOT별 재고", lotRecordId, {
      "재고수량": Math.max(0, currentStock - 이동수량),
    }),
    patchRecord("입고 관리", inboundRecordId, {
      "잔여수량": Math.max(0, currentRemain - 이동수량),
    }),
  ]);

  // 9. 재고 이동 레코드에 신규 LOT 링크 업데이트
  await patchRecord("재고 이동", transferRecordId, {
    "신규 LOT번호": [newLot.id],
  });

  log("[approveTransfer] 완료:", {
    transferRecordId,
    originalLot: originalLotNumber,
    newLot: newLotNumber,
    이동수량,
    newPurchasePrice: pricing.newPurchasePrice,
    carried: {
      refrigeration: pricing.newCarriedRefrigeration,
      inOut: pricing.newCarriedInOutFee,
      union: pricing.newCarriedUnionFee,
      freeze: pricing.newCarriedFreezeFee,
    },
  });

  return { success: true };
}

/**
 * 재고 이동 승인 → 반려 전환 시 자동 복구 (admin.ts updateApprovalStatus에서 호출).
 *
 * 안전 가드 3가지를 모두 통과해야 복구가 진행된다 — 신규 LOT/입고관리에서 후속
 * 작업이 일어났다면 자동 복구가 데이터를 망가뜨릴 수 있어 차단하고 운영자 보정 유도.
 *
 * 검사:
 *  (a) 신규 LOT.재고수량 == 이동수량 (이동 후 출고/조정으로 변한 적 없음)
 *  (b) 신규 LOT을 원본으로 한 다른 재이동이 반려 상태가 아닌 게 없음
 *  (c) 신규 입고관리에서 발생한 출고가 반려 상태가 아닌 게 없음
 *
 * 통과 시:
 *  - 원본 LOT.재고수량 += 이동수량
 *  - 원본 입고관리.잔여수량 += 이동수량
 *  - 신규 LOT.재고수량 = 0 (soft delete — 레코드 보존, 화면에서만 사라짐)
 *  - 신규 입고관리.잔여수량 = 0, 승인상태 = "반려"
 *
 * 옵션 B 이월 4개(이월냉장료/이월입출고비/이월노조비/이월동결비)는 신규 LOT의
 * 재고수량이 0이 되면 손익 계산상 의미가 사라지므로 별도 처리 불필요. 원본 LOT의
 * 이월값은 이동 시 손대지 않았으므로 그대로 유지됨.
 *
 * 실패(검사 또는 PATCH) 시 [INTEGRITY-ALERT] 로그 + success:false 반환 → admin.ts가
 * 반려 처리 자체를 중단해 정합성 깨진 상태 진입을 방지.
 */
export async function revertTransferOnReject(
  transferRecordId: string,
): Promise<{ success: boolean; message?: string }> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    return { success: false, message: "환경변수 누락" };
  }

  const tfFields = await fetchRecord("재고 이동", transferRecordId);
  if (!tfFields) {
    return { success: false, message: "재고 이동 레코드를 찾을 수 없습니다." };
  }

  const 이동수량 = num(tfFields["이동수량"]);
  if (이동수량 <= 0) {
    return { success: false, message: "이동수량이 올바르지 않습니다." };
  }

  const originalLotRecordId = firstLink(tfFields["원본 LOT번호"]);
  const newLotRecordId = firstLink(tfFields["신규 LOT번호"]);

  if (!originalLotRecordId) {
    return { success: false, message: "원본 LOT 링크가 없습니다." };
  }

  // 신규 LOT 링크 없음 = approveTransfer가 LOT 생성 단계에서 실패했던 흔적.
  // 원본 차감(transfer.ts:454-461)도 일어나지 않은 상태이므로 복구할 게 없음.
  if (!newLotRecordId) {
    logWarn(
      "[revertTransferOnReject] 신규 LOT 링크 없음 — 승인이 미완 상태였던 것으로 보아 복구 작업 생략:",
      { transferRecordId },
    );
    return { success: true };
  }

  const newLotFields = await fetchRecord("LOT별 재고", newLotRecordId);
  if (!newLotFields) {
    logWarn(
      "[revertTransferOnReject] 신규 LOT 레코드 없음 — 복구 생략:",
      { transferRecordId, newLotRecordId },
    );
    return { success: true };
  }

  const newLotStock = num(newLotFields["재고수량"]);

  // 멱등 가드: 이미 0이면 복구 끝난 상태로 간주 (반려 → 다시 반려 등)
  if (newLotStock === 0) {
    log(
      "[revertTransferOnReject] 신규 LOT 재고가 이미 0 — 중복 처리 생략:",
      { transferRecordId, newLotRecordId },
    );
    return { success: true };
  }

  const newLotLabel = String(newLotFields["LOT번호"] ?? newLotRecordId);

  // 검사 (a)
  if (newLotStock !== 이동수량) {
    logError(
      "[INTEGRITY-ALERT][revertTransferOnReject] 신규 LOT 재고가 이동수량과 다름 — 후속 출고/조정 발생 추정, 자동 복구 차단:",
      { transferRecordId, newLotRecordId, newLotStock, 이동수량 },
    );
    return {
      success: false,
      message: `신규 LOT(${newLotLabel}) 재고가 이동수량과 달라 자동 복구할 수 없습니다. 후속 출고/조정 확인 후 수동 보정해주세요.`,
    };
  }

  // 검사 (b) — 신규 LOT을 원본으로 한 다른 재이동(반려 외)이 있는가
  const allTransfers = await listRecords("재고 이동");
  for (const tf of allTransfers) {
    if (tf.id === transferRecordId) continue;
    const origLotLink = tf.fields["원본 LOT번호"];
    const usesNewLot =
      Array.isArray(origLotLink) &&
      (origLotLink as unknown[]).some(
        (v) => typeof v === "string" && v === newLotRecordId,
      );
    if (!usesNewLot) continue;
    const status = String(tf.fields["승인상태"] ?? "");
    if (status !== "반려") {
      logError(
        "[INTEGRITY-ALERT][revertTransferOnReject] 신규 LOT을 원본으로 한 다른 재이동이 활성 상태 — 자동 복구 차단:",
        {
          transferRecordId,
          newLotRecordId,
          blockedByTransferId: tf.id,
          blockedByStatus: status,
        },
      );
      return {
        success: false,
        message: `신규 LOT(${newLotLabel})이 다른 곳으로 또 이동된 기록이 있어 자동 복구할 수 없습니다.`,
      };
    }
  }

  const newInboundRecordId = firstLink(newLotFields["입고관리링크"]);

  // 검사 (c) — 신규 입고관리에서 발생한 출고(반려 외)가 있는가
  if (newInboundRecordId) {
    const allOutbounds = await listRecords("출고 관리");
    for (const ob of allOutbounds) {
      const inLink = ob.fields["입고관리"];
      const usesNewInbound =
        Array.isArray(inLink) &&
        (inLink as unknown[]).some(
          (v) => typeof v === "string" && v === newInboundRecordId,
        );
      if (!usesNewInbound) continue;
      const status = String(ob.fields["승인상태"] ?? "");
      if (status !== "반려") {
        logError(
          "[INTEGRITY-ALERT][revertTransferOnReject] 신규 입고관리에서 발생한 출고가 활성 상태 — 자동 복구 차단:",
          {
            transferRecordId,
            newLotRecordId,
            newInboundRecordId,
            blockedByOutboundId: ob.id,
            blockedByStatus: status,
          },
        );
        return {
          success: false,
          message: `신규 LOT(${newLotLabel})에서 출고된 기록이 있어 자동 복구할 수 없습니다.`,
        };
      }
    }
  }

  // 원본 LOT 복구
  const origLotFields = await fetchRecord("LOT별 재고", originalLotRecordId);
  if (!origLotFields) {
    logError(
      "[INTEGRITY-ALERT][revertTransferOnReject] 원본 LOT 레코드 없음 — 복구 중단:",
      { transferRecordId, originalLotRecordId },
    );
    return { success: false, message: "원본 LOT 레코드를 찾을 수 없습니다." };
  }
  const origLotStock = num(origLotFields["재고수량"]);
  const lotPatchOk = await patchRecord("LOT별 재고", originalLotRecordId, {
    재고수량: origLotStock + 이동수량,
  });
  if (!lotPatchOk) {
    logError(
      "[INTEGRITY-ALERT][revertTransferOnReject] 원본 LOT 재고수량 복구 PATCH 실패:",
      { transferRecordId, originalLotRecordId, origLotStock, 이동수량 },
    );
    return { success: false, message: "원본 LOT 재고수량 복구에 실패했습니다." };
  }

  // 원본 입고관리 복구
  const origInboundRecordId = firstLink(origLotFields["입고관리링크"]);
  if (origInboundRecordId) {
    const origInboundFields = await fetchRecord("입고 관리", origInboundRecordId);
    if (origInboundFields) {
      const origRemain = num(origInboundFields["잔여수량"]);
      const inboundPatchOk = await patchRecord("입고 관리", origInboundRecordId, {
        잔여수량: origRemain + 이동수량,
      });
      if (!inboundPatchOk) {
        logError(
          "[INTEGRITY-ALERT][revertTransferOnReject] 원본 입고관리 잔여수량 복구 PATCH 실패 — 원본 LOT은 이미 복구됨, 수동 정합 필요:",
          {
            transferRecordId,
            originalLotRecordId,
            origInboundRecordId,
            origRemain,
            이동수량,
          },
        );
        return {
          success: false,
          message: "원본 입고관리 잔여수량 복구에 실패했습니다. (원본 LOT 재고수량은 이미 복구됨 — 수동 정합 확인 필요)",
        };
      }
    } else {
      logWarn(
        "[revertTransferOnReject] 원본 입고관리 레코드 없음 — 잔여수량 복구 생략:",
        { transferRecordId, origInboundRecordId },
      );
    }
  } else {
    logWarn(
      "[revertTransferOnReject] 원본 LOT의 입고관리링크 없음 — 잔여수량 복구 생략:",
      { transferRecordId, originalLotRecordId },
    );
  }

  // 신규 LOT soft delete
  const newLotZeroOk = await patchRecord("LOT별 재고", newLotRecordId, {
    재고수량: 0,
  });
  if (!newLotZeroOk) {
    logError(
      "[INTEGRITY-ALERT][revertTransferOnReject] 신규 LOT 재고수량 0 PATCH 실패 — 원본 복구는 완료, 신규 LOT 수동 정리 필요:",
      { transferRecordId, newLotRecordId },
    );
  }

  // 신규 입고관리 soft delete
  if (newInboundRecordId) {
    const newInboundClearOk = await patchRecord("입고 관리", newInboundRecordId, {
      잔여수량: 0,
      승인상태: "반려",
    });
    if (!newInboundClearOk) {
      logError(
        "[INTEGRITY-ALERT][revertTransferOnReject] 신규 입고관리 soft delete PATCH 실패 — 수동 정리 필요:",
        { transferRecordId, newInboundRecordId },
      );
    }
  }

  log("[revertTransferOnReject] 자동 복구 완료:", {
    transferRecordId,
    originalLotRecordId,
    newLotRecordId,
    newInboundRecordId,
    이동수량,
  });
  return { success: true };
}
