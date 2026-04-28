import { log, logError, logWarn } from '@/lib/logger';
"use server";

import { revalidatePath } from "next/cache";
import { getStorageCostForLot } from "@/lib/storage-cost";

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

async function getMaxLotSequence(): Promise<number> {
  let maxSeq = 0;
  let offset: string | undefined;
  do {
    const params = new URLSearchParams({ pageSize: "100", "fields[]": "LOT번호" });
    if (offset) params.set("offset", offset);
    const res = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/LOT별%20재고?${params}`,
      { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }, next: { revalidate: 0 } },
    );
    if (!res.ok) break;
    const data = await res.json() as { records?: { fields?: Record<string, unknown> }[]; offset?: string };
    for (const rec of data.records ?? []) {
      const m = String(rec.fields?.["LOT번호"] ?? "").match(/-(\d{4})$/);
      if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
    }
    offset = data.offset;
  } while (offset);
  return maxSeq + 1;
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
  // workerId는 rec… 형식 레코드ID 또는 유효한 문자열 허용
  if (!workerId) return { success: false, message: "로그인 정보를 확인해주세요." };

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
    if (isRecordId(workerId)) fields["작업자"] = [workerId];
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

  // 4. 새 수매가 = 판매원가 × (이동수량 / 재고수량)
  //    판매원가 = 수매가 + 누적냉장료 + 입출고비 + 노조비 + 동결비
  const totalCurrentCost =
    num(lotFields["수매가"]) +
    num(lotFields["누적냉장료"]) +
    num(lotFields["입출고비"]) +
    num(lotFields["노조비"]) +
    num(lotFields["동결비"]);
  const ratio = currentStock > 0 ? 이동수량 / currentStock : 0;
  const newPurchasePrice = Math.round(totalCurrentCost * ratio);

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
  const seq = await getMaxLotSequence();
  const newLotNumber = buildLotNumber({ bizDate, productCode, spec, misu, seq });

  // 6. 새 입고관리 레코드 생성
  const productMasterId = firstLink(inboundFields["품목마스터"]);
  const supplierId = firstLink(inboundFields["매입처"]);
  const 원산지 = String(inboundFields["원산지"] ?? "").trim();

  const newInboundFields: Record<string, unknown> = {
    "입고일": 이동일,
    "규격": spec,
    "미수": misu,
    "입고수량": 이동수량,
    "잔여수량": 이동수량,
    "수매가": newPurchasePrice,
    "원산지": 원산지,
    "승인상태": "승인 완료",
    "비고": "재고 이동",
  };
  if (productMasterId) newInboundFields["품목마스터"] = [productMasterId];
  if (newStorageId) newInboundFields["보관처"] = [newStorageId];
  if (workerId) {
    newInboundFields["작업자"] = [workerId];
    newInboundFields["매입자"] = [workerId];
  }
  if (supplierId) newInboundFields["매입처"] = [supplierId];

  const newInbound = await createRecord("입고 관리", newInboundFields);
  if (!newInbound?.id) return { success: false, message: "신규 입고 관리 레코드 생성 실패" };

  // LOT번호 별도 PATCH (생성 시 자동 채번이 필요하므로 분리)
  await patchRecord("입고 관리", newInbound.id, { "LOT번호": newLotNumber });

  // 7. 새 LOT별 재고 레코드 생성
  const newStorageName = newStorageId ? await resolveStorageName(newStorageId) : "";
  const lotInventoryFields: Record<string, unknown> = {
    "LOT번호": newLotNumber,
    "입고관리링크": [newInbound.id],
    "재고수량": 이동수량,
    "수매가": newPurchasePrice,
    "입고일자": 이동일,
    "LOT번호(이동출처)": [lotRecordId],
  };
  if (newStorageId) lotInventoryFields["보관처"] = [newStorageId];

  if (newStorageName) {
    try {
      const cost = await getStorageCostForLot(newStorageName, 이동일);
      if (cost?.refrigerationFee != null) lotInventoryFields["냉장료단가"] = cost.refrigerationFee;
      if (cost?.inOutFee != null) lotInventoryFields["입출고비"] = cost.inOutFee;
      if (cost?.unionFee != null) lotInventoryFields["노조비"] = cost.unionFee;
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
    newPurchasePrice,
  });

  return { success: true };
}
