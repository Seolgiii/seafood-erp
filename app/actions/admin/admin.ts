"use server";
import { log, logError, logWarn } from '@/lib/logger';

// ─────────────────────────────────────────────────────────────────────────────
// 관리자 승인 처리 모듈
// 관리자(ADMIN/MASTER)가 입고·출고·지출결의 신청 건을 승인하거나 반려할 때
// 이 파일의 함수들이 실행됩니다.
//
// 승인 흐름 요약:
//  - 입고 승인 → LOT별 재고 수량 반영 → 상태 업데이트 → 입고증 PDF 생성
//  - 출고 승인 → 입고 관리 잔여수량 차감 + LOT 재고 차감 → 상태 업데이트 → 출고증 PDF 생성
//  - 지출 승인 → 상태 업데이트 → 지출결의서 PDF 생성
// ─────────────────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";
import { getMyRequests } from "../my-requests";
import type { RequestItem } from "../my-requests";
import { approveTransfer } from "../inventory/transfer";
import { getStorageCostForLot } from "@/lib/storage-cost";
import { seoulDateString } from "@/lib/date";
import {
  generateInboundPdf,
  generateOutboundPdf,
  generateExpensePdf,
} from "@/lib/generate-pdf.server";

// Airtable 접속에 필요한 인증 키와 데이터베이스 ID (환경변수에서 읽어옴)
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

// 결재 대기 중인 상태값 목록 (이 상태인 건만 관리자 대시보드에 표시)
const PENDING_STATUSES: string[] = ["승인 대기", "최종 승인 대기"];

// 신청 유형(EXPENSE/INBOUND/OUTBOUND/TRANSFER) → Airtable 테이블명 매핑
const TABLE_MAP: Record<string, string> = {
  EXPENSE: "지출결의",
  INBOUND: "입고 관리",
  OUTBOUND: "출고 관리",
  TRANSFER: "재고 이동",
};

/**
 * 현재 승인 대기 중인 신청 건 목록을 반환합니다.
 * 관리자 대시보드 화면에서 처리해야 할 목록을 불러올 때 사용합니다.
 */
export async function getPendingApprovals(): Promise<RequestItem[]> {
  const all = await getMyRequests();
  return all.filter((item) => PENDING_STATUSES.includes(item.status));
}

// ── 출고 승인 시 재고 차감 헬퍼 ──────────────────────────────────────────

/**
 * Airtable에서 특정 테이블의 레코드(행) 하나를 조회하여 필드값을 반환합니다.
 * 내부적으로 입고·출고·지출결의 데이터를 읽을 때 공통으로 사용합니다.
 */
async function fetchRecord(
  tableName: string,
  recordId: string,
): Promise<Record<string, unknown> | null> {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}/${recordId}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    logError(`[fetchRecord] ${tableName}/${recordId} 조회 실패:`, res.status);
    return null;
  }
  const data = await res.json();
  return (data.fields as Record<string, unknown>) ?? null;
}

/**
 * Airtable 레코드의 특정 필드값을 수정(업데이트)합니다.
 * 입고 승인 시 재고수량 반영, 출고 승인 시 잔여수량 차감 등에 사용합니다.
 */
async function patchRecord(
  tableName: string,
  recordId: string,
  fields: Record<string, unknown>,
): Promise<boolean> {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}/${recordId}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logError(`[patchRecord] ${tableName}/${recordId} PATCH 실패:`, res.status, body);
  }
  return res.ok;
}

// ── PDF 생성 헬퍼 ─────────────────────────────────────────────────────────

/** 링크 필드(배열·단일 문자열)에서 첫 번째 레코드 ID 추출 */
function firstLinkId(val: unknown): string | null {
  if (typeof val === "string" && /^rec[a-zA-Z0-9]+$/.test(val)) return val;
  if (Array.isArray(val)) {
    const v = val[0];
    if (typeof v === "string" && /^rec[a-zA-Z0-9]+$/.test(v)) return v;
  }
  return null;
}

/**
 * 작업자 레코드 ID로 작업자 테이블에서 작업자명을 조회합니다.
 * PDF에 신청자 이름을 표시하기 위해 사용합니다.
 */
async function fetchWorkerName(workerId: string): Promise<string> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) return "";
  const res = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent("작업자")}/${workerId}`,
    { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }, next: { revalidate: 0 } },
  );
  if (!res.ok) return "";
  const data = await res.json();
  return String(data.fields?.["작업자명"] ?? "");
}

/**
 * 품목마스터 레코드 ID로 품목명을 조회합니다.
 * PDF에 품목명을 표시하기 위해 사용합니다.
 */
async function fetchProductName(productId: string): Promise<string> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) return "";
  const res = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent("품목마스터")}/${productId}`,
    { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }, next: { revalidate: 0 } },
  );
  if (!res.ok) return "";
  const data = await res.json();
  return String(data.fields?.["품목명"] ?? "");
}

/** 보관처 link 필드 값(record id 배열) → 보관처명 문자열 변환 */
async function resolveStorageName(rawField: unknown): Promise<string> {
  const id = Array.isArray(rawField) && rawField.length > 0 ? rawField[0] : null;
  if (!id || typeof id !== "string" || !/^rec/.test(id)) return "";
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent("보관처 마스터")}/${id}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    next: { revalidate: 0 },
  });
  if (!res.ok) return "";
  const data = await res.json();
  return String(data.fields?.["보관처명"] ?? "");
}

/**
 * 입고 승인 후 입고증 PDF를 생성하여 Vercel Blob 스토리지에 저장합니다.
 * 저장된 PDF URL을 입고 관리 레코드의 '입고증URL' 필드에 기록합니다.
 */
async function generateAndSaveInboundPdf(recordId: string): Promise<void> {
  log("[generateAndSaveInboundPdf] 시작:", recordId);
  try {
    const fields = await fetchRecord("입고 관리", recordId);
    if (!fields) {
      logError("[generateAndSaveInboundPdf] 입고 관리 레코드 조회 실패:", recordId);
      return;
    }

    const workerRecId = firstLinkId(fields["작업자"]);
    const productRecId = firstLinkId(fields["품목마스터"] ?? fields["품목"]);
    log("[generateAndSaveInboundPdf] 연결 ID:", { workerRecId, productRecId });

    const [requester, productName] = await Promise.all([
      workerRecId ? fetchWorkerName(workerRecId) : Promise.resolve(""),
      productRecId ? fetchProductName(productRecId) : Promise.resolve(""),
    ]);
    log("[generateAndSaveInboundPdf] 이름 조회 완료:", { requester, productName });

    const pdfData = {
      lotNumber: String(fields["LOT번호"] ?? ""),
      productName,
      spec: String(fields["규격"] ?? ""),
      quantity: Number(fields["입고수량"] ?? 0),
      storage: await resolveStorageName(fields["보관처"]),
      origin: String(fields["원산지"] ?? ""),
      purchasePrice: Number(fields["수매가"] ?? 0),
      date: String(fields["입고일"] ?? ""),
      requester,
    };
    log("[generateAndSaveInboundPdf] PDF 데이터:", pdfData);

    log("[generateAndSaveInboundPdf] renderToBuffer 시작...");
    const pdfBuffer = await generateInboundPdf(pdfData);
    log("[generateAndSaveInboundPdf] renderToBuffer 완료, 크기:", pdfBuffer.length);

    log("[generateAndSaveInboundPdf] Blob 업로드 시작...");
    const blob = await put(
      `pdfs/inbound-${recordId}-${Date.now()}.pdf`,
      pdfBuffer,
      { access: "public", contentType: "application/pdf" },
    );
    log("[generateAndSaveInboundPdf] Blob 업로드 완료:", blob.url);

    await patchRecord("입고 관리", recordId, { "입고증URL": blob.url });
    log("[generateAndSaveInboundPdf] Airtable URL 저장 완료");
  } catch (e) {
    logError("[generateAndSaveInboundPdf] 오류 발생:", e instanceof Error ? e.stack : e);
    throw e;
  }
}

/**
 * 출고 승인 후 출고증 PDF를 생성하여 Vercel Blob 스토리지에 저장합니다.
 * 출고 관리 → 입고 관리 → 품목마스터 순서로 품목명을 추적합니다.
 */
async function generateAndSaveOutboundPdf(recordId: string): Promise<void> {
  const fields = await fetchRecord("출고 관리", recordId);
  if (!fields) return;

  const workerRecId = firstLinkId(fields["작업자"]);
  const lotLinkId = firstLinkId(fields["LOT번호"]);

  // 품목명: LOT링크 → 입고 관리 → 품목마스터 체인
  let productName = "";
  if (lotLinkId) {
    const inboundFields = await fetchRecord("입고 관리", lotLinkId);
    if (inboundFields) {
      const productRecId = firstLinkId(
        inboundFields["품목마스터"] ?? inboundFields["품목"],
      );
      if (productRecId) productName = await fetchProductName(productRecId);
    }
  }

  // LOT번호 표시값 (rollup/lookup 필드 우선)
  const lotDisplay = fields["LOT번호(표시용)"];
  const lotNumber = (
    Array.isArray(lotDisplay) ? String(lotDisplay[0] ?? "") : String(lotDisplay ?? "")
  ).trim();

  const requester = workerRecId ? await fetchWorkerName(workerRecId) : "";

  // 출고증 PDF 생성
  const pdfBuffer = await generateOutboundPdf({
    lotNumber,
    productName,
    quantity: Number(fields["출고수량"] ?? 0),
    buyer: String(fields["판매처"] ?? ""),
    saleAmount: Number(fields["판매금액"] ?? 0),
    date: String(fields["출고일"] ?? ""),
    requester,
  });

  // PDF를 Vercel Blob에 업로드하고 URL을 출고 관리 레코드에 저장
  const blob = await put(
    `pdfs/outbound-${recordId}-${Date.now()}.pdf`,
    pdfBuffer,
    { access: "public", contentType: "application/pdf" },
  );
  await patchRecord("출고 관리", recordId, { "출고증URL": blob.url });
  log("[generateAndSaveOutboundPdf] PDF 저장 완료:", blob.url);
}

/**
 * 지출 승인 후 지출결의서 PDF를 생성하여 Vercel Blob 스토리지에 저장합니다.
 */
async function generateAndSaveExpensePdf(recordId: string): Promise<void> {
  const fields = await fetchRecord("지출결의", recordId);
  if (!fields) return;

  // 신청자명: 링크 필드 → 작업자 테이블 해석
  const workerRecId = firstLinkId(fields["신청자"]);
  const requester = workerRecId ? await fetchWorkerName(workerRecId) : "";

  // 소속·직급은 Airtable 룩업(computed) 필드 — 읽기는 가능
  const pdfBuffer = await generateExpensePdf({
    createdDate: String(fields["작성일"] ?? ""),
    requester,
    dept: String(fields["소속"] ?? ""),
    position: String(fields["직급"] ?? ""),
    expenseDate: String(fields["지출일"] ?? ""),
    title: String(fields["건명"] ?? ""),
    amount: Number(fields["금액"] ?? 0),
    description: String(fields["적요"] ?? ""),
    approvalStatus: String(fields["승인상태"] ?? ""),
  });

  // PDF를 Vercel Blob에 업로드하고 URL을 지출결의 레코드에 저장
  const blob = await put(
    `pdfs/expense-${recordId}-${Date.now()}.pdf`,
    pdfBuffer,
    { access: "public", contentType: "application/pdf" },
  );
  await patchRecord("지출결의", recordId, { "지출결의서URL": blob.url });
  log("[generateAndSaveExpensePdf] PDF 저장 완료:", blob.url);
}

/**
 * 입고 승인 시 처리:
 * 신청 시점에 재고수량=0으로 미리 생성된 LOT별 재고 레코드를 찾아
 * 재고수량을 실제 입고 수량으로 PATCH한다.
 * (수매가·비고는 이미 신청 시점에 LOT별 재고에 저장되어 있음)
 *
 * 입고 신청 시 재고는 0으로 예약만 해두었다가,
 * 관리자가 승인하는 순간 실제 수량이 반영됩니다.
 * 중복 승인 방지를 위해 이미 "승인 완료" 상태면 건너뜁니다.
 */
async function createLotOnInboundApproval(
  inboundRecordId: string,
): Promise<{ success: boolean; message?: string }> {
  // 1. 입고 관리 레코드에서 입고수량 확인
  const inboundFields = await fetchRecord("입고 관리", inboundRecordId);
  if (!inboundFields) {
    return { success: false, message: "입고 관리 레코드를 찾을 수 없습니다." };
  }

  // 중복 승인 방지 (이미 승인 완료된 건은 재처리하지 않음)
  const currentStatus = String(inboundFields["승인상태"] ?? "").trim();
  if (currentStatus === "승인 완료") {
    return { success: true };
  }

  const qty = Number(inboundFields["입고수량"]);
  if (!Number.isFinite(qty) || qty <= 0) {
    return { success: false, message: `입고수량을 읽을 수 없습니다. (값: ${inboundFields["입고수량"]})` };
  }

  // Airtable 수식에서 링크 필드({입고관리링크})는 record ID가 아닌
  // 연결 레코드의 기본 필드 값을 반환하므로, LOT번호 텍스트 필드로 조회
  const lotNumber = String(inboundFields["LOT번호"] ?? "").trim();
  if (!lotNumber) {
    return { success: false, message: "입고 관리에 LOT번호가 없습니다. LOT번호 PATCH가 완료됐는지 확인하세요." };
  }

  // 2. LOT번호로 LOT별 재고 레코드 조회 (신청 시 생성된 재고=0 레코드를 찾음)
  const formula = encodeURIComponent(`{LOT번호}="${lotNumber}"`);
  const lotQueryRes = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/LOT별%20재고?filterByFormula=${formula}&maxRecords=1`,
    {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
      next: { revalidate: 0 },
    },
  );
  if (!lotQueryRes.ok) {
    const body = await lotQueryRes.text().catch(() => "");
    logError("[createLotOnInboundApproval] LOT별 재고 조회 실패:", lotQueryRes.status, body);
    return { success: false, message: "LOT별 재고 조회에 실패했습니다." };
  }
  const lotQueryData = await lotQueryRes.json();
  const lotRecord = lotQueryData.records?.[0];
  if (!lotRecord?.id) {
    return { success: false, message: `LOT별 재고 레코드를 찾을 수 없습니다. (LOT번호: ${lotNumber})` };
  }

  // 3. 재고수량 + 입고자를 실제 값으로 PATCH (0 → 실제 입고수량, 입고자 링크 설정)
  // 입고 관리의 작업자 링크 필드에서 worker record ID를 추출하여 입고자에 저장
  const workerLinkId = firstLinkId(inboundFields["작업자"]);
  const lotPatchFields: Record<string, unknown> = { 재고수량: qty };
  if (workerLinkId) {
    lotPatchFields["입고자"] = [workerLinkId]; // 작업자 테이블 링크 배열 형태로 저장
  }

  // 입고일자 기준으로 보관처 비용 이력에서 냉장료단가·입출고비·노조비를 조회해 LOT에 저장
  const storage = await resolveStorageName(inboundFields["보관처"]);
  const inboundDate = String(inboundFields["입고일"] ?? "").trim() || seoulDateString();
  if (storage) {
    try {
      const cost = await getStorageCostForLot(storage, inboundDate);
      if (cost?.refrigerationFee != null) lotPatchFields["냉장료단가"] = cost.refrigerationFee;
      if (cost?.inOutFee != null) lotPatchFields["입출고비"] = cost.inOutFee;
      if (cost?.unionFee != null) lotPatchFields["노조비"] = cost.unionFee;
    } catch (e) {
      logWarn("[createLotOnInboundApproval] 보관처 비용 조회 실패 (승인은 계속 진행):", e);
    }
  }

  const patched = await patchRecord("LOT별 재고", lotRecord.id, lotPatchFields);
  if (!patched) {
    return { success: false, message: "LOT별 재고 수량 업데이트에 실패했습니다." };
  }

  log("[createLotOnInboundApproval] 재고수량 반영 완료:", { inboundRecordId, lotRecordId: lotRecord.id, qty, lotNumber });
  return { success: true };
}

/**
 * 출고 승인 시 입고 관리.잔여수량 및 LOT별 재고.재고수량 차감
 *
 * 관리자가 출고를 승인하는 순간 실제 재고에서 출고 수량만큼 차감됩니다.
 * 두 테이블 모두 업데이트해야 재고 현황 화면에서 정확한 수량이 표시됩니다.
 *  - 입고 관리.잔여수량: 해당 LOT에서 아직 출고 가능한 수량
 *  - LOT별 재고.재고수량: LOT 단위의 현재 재고
 */
async function deductStockOnOutboundApproval(
  outboundRecordId: string,
): Promise<{ success: boolean; message?: string }> {
  // 1. 출고 관리 레코드 조회 (출고수량, 연결된 입고 관리 ID 확인)
  const outFields = await fetchRecord("출고 관리", outboundRecordId);
  if (!outFields) {
    return { success: false, message: "출고 레코드를 찾을 수 없습니다." };
  }

  const outQty = Number(outFields["출고수량"]);
  if (!Number.isFinite(outQty) || outQty <= 0) {
    return { success: false, message: "출고 수량이 올바르지 않습니다." };
  }

  // fields["LOT번호"]는 입고 관리 레코드 링크 배열
  const rawLotLink = outFields["LOT번호"];
  const inboundRecordId =
    Array.isArray(rawLotLink) && typeof rawLotLink[0] === "string" && /^rec/.test(rawLotLink[0])
      ? rawLotLink[0]
      : null;
  if (!inboundRecordId) {
    return { success: false, message: "출고 레코드에 입고 관리 연결 정보가 없습니다." };
  }

  // LOT별 재고 레코드 ID (출고 신청 시 저장해둔 값)
  const lotInventoryRecordId = String(outFields["LOT재고레코드ID"] ?? "").trim();

  // 2. 입고 관리 잔여수량 확인 (최종 재고 부족 체크)
  const inboundFields = await fetchRecord("입고 관리", inboundRecordId);
  if (!inboundFields) {
    return { success: false, message: "입고 관리 레코드를 찾을 수 없습니다." };
  }
  const currentRemain = Number(inboundFields["잔여수량"]);
  if (!Number.isFinite(currentRemain)) {
    return { success: false, message: "입고 관리 잔여수량을 확인할 수 없습니다." };
  }
  if (outQty > currentRemain) {
    // 신청 이후 다른 출고로 재고가 감소했을 경우 최종 방어 처리
    return {
      success: false,
      message: `재고 부족으로 승인할 수 없습니다. (잔여: ${currentRemain}, 출고: ${outQty})`,
    };
  }

  // 3. 입고 관리.잔여수량 차감 (이 LOT에서 출고 가능한 수량 감소)
  const inboundOk = await patchRecord("입고 관리", inboundRecordId, {
    잔여수량: currentRemain - outQty,
  });
  if (!inboundOk) {
    return { success: false, message: "입고 관리 잔여수량 차감에 실패했습니다." };
  }

  // 4. LOT별 재고.재고수량 차감 (LOT 단위 현재 재고 감소)
  if (lotInventoryRecordId && /^rec/.test(lotInventoryRecordId)) {
    const lotFields = await fetchRecord("LOT별 재고", lotInventoryRecordId);
    if (lotFields) {
      const rawQty = lotFields["재고수량"];
      const currentLotQty = Number(Array.isArray(rawQty) ? rawQty[0] : rawQty) || 0;
      // Math.max(0, ...) 로 음수 방지 (혹시라도 마이너스 재고가 되지 않도록)
      await patchRecord("LOT별 재고", lotInventoryRecordId, {
        재고수량: Math.max(0, currentLotQty - outQty),
      });

      // 5. 출고시점 비용 계산 → 출고 관리에 저장
      try {
        const num = (v: unknown) =>
          Number(Array.isArray(v) ? v[0] : v) || 0;

        const purchasePrice = num(lotFields["수매가"]);
        const totalWeight = num(lotFields["총중량"]);
        const refrigerationFeePerUnit = num(lotFields["냉장료단가"]);
        const inOutFee = num(lotFields["입출고비"]);
        const unionFee = num(lotFields["노조비"]);
        const lotInboundDate = String(lotFields["입고일자"] ?? "").trim();

        const outboundDate = String(outFields["출고일"] ?? "").trim();
        const saleAmount = num(outFields["판매금액"]);

        // 출고시점 단가: 수매가 ÷ 총중량
        const unitCost = totalWeight > 0 ? purchasePrice / totalWeight : 0;

        // 출고시점 냉장료: 냉장료단가 × 보관일수
        let daysHeld = 0;
        if (lotInboundDate && outboundDate) {
          const diff = new Date(outboundDate).getTime() - new Date(lotInboundDate).getTime();
          daysHeld = Math.max(0, Math.floor(diff / 86_400_000));
        }
        const refrigerationCost = refrigerationFeePerUnit * daysHeld;

        const totalCost = unitCost + refrigerationCost + inOutFee + unionFee;

        await patchRecord("출고 관리", outboundRecordId, {
          "출고시점 단가": unitCost,
          "출고시점 냉장료": refrigerationCost,
          "출고시점 입출고비": inOutFee,
          "출고시점 노조비": unionFee,
          "출고시점 판매원가": totalCost,
          "출고시점 판매금액": saleAmount,
          "출고시점 손익": saleAmount - totalCost,
        });
      } catch (e) {
        logWarn("[deductStockOnOutboundApproval] 출고시점 비용 저장 실패 (승인은 계속 진행):", e);
      }
    } else {
      logWarn("[deductStockOnOutboundApproval] LOT재고레코드ID 있으나 레코드 없음:", lotInventoryRecordId);
    }
  } else {
    logWarn("[deductStockOnOutboundApproval] LOT재고레코드ID 없음 — LOT별 재고 차감 건너뜀");
  }

  return { success: true };
}

/**
 * 승인 상태 업데이트 (승인 완료 / 최종 승인 대기 / 반려)
 *
 * 관리자 대시보드에서 "승인" 또는 "반려" 버튼을 누르면 이 함수가 호출됩니다.
 * 처리 순서:
 *   1. 입고 승인이면 → LOT 재고수량 반영
 *   2. 출고 승인이면 → 재고 차감
 *   3. Airtable 승인상태 필드 업데이트
 *   4. 승인 완료 시 → PDF 자동 생성 및 저장 (백그라운드 실행, 실패해도 승인에 영향 없음)
 */
export async function updateApprovalStatus(
  recordId: string,
  type: "INBOUND" | "OUTBOUND" | "EXPENSE" | "TRANSFER",
  newStatus: string,
  rejectReason: string = "",
): Promise<{ success: boolean; message?: string }> {
  log("[updateApprovalStatus] entered", { recordId, type, newStatus, rejectReason });

  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    return { success: false, message: "환경변수 AIRTABLE_API_KEY / AIRTABLE_BASE_ID 누락" };
  }

  const tableName = TABLE_MAP[type];
  if (!tableName) {
    return { success: false, message: "잘못된 유형입니다." };
  }

  // 입고 승인 시 LOT별 재고 생성 (상태 업데이트 전에 먼저 재고 반영)
  if (type === "INBOUND" && newStatus === "승인 완료") {
    const createResult = await createLotOnInboundApproval(recordId);
    if (!createResult.success) {
      return { success: false, message: createResult.message };
    }
  }

  // 출고 승인 시 재고 선차감 (상태 업데이트 전에 먼저 재고 차감)
  if (type === "OUTBOUND" && newStatus === "승인 완료") {
    const deductResult = await deductStockOnOutboundApproval(recordId);
    if (!deductResult.success) {
      return { success: false, message: deductResult.message };
    }
  }

  // 재고 이동 승인 시 새 LOT 생성 + 원본 재고 차감
  if (type === "TRANSFER" && newStatus === "승인 완료") {
    const transferResult = await approveTransfer(recordId);
    if (!transferResult.success) {
      return { success: false, message: transferResult.message };
    }
  }

  try {
    // Airtable 레코드의 승인상태 필드를 새 상태로 업데이트
    const fields: Record<string, unknown> = { "승인상태": newStatus };
    if (rejectReason) fields["반려사유"] = rejectReason; // 반려 시 사유도 함께 저장

    log("[updateApprovalStatus] patching", { tableName, recordId, fields });

    const res = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}/${recordId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields }),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      logError("[updateApprovalStatus] Airtable error", res.status, body);
      return { success: false, message: `Airtable 오류 (${res.status})` };
    }

    log("[updateApprovalStatus] patch success");

    // 승인 완료 시 PDF 자동 생성 및 Blob 저장
    // await를 사용해야 Vercel serverless 함수가 종료되기 전에 PDF 생성이 완료됨
    // .catch()로 오류를 잡아 PDF 생성 실패가 승인 처리 전체를 막지 않도록 함
    if (newStatus === "승인 완료") {
      if (type === "INBOUND") {
        await generateAndSaveInboundPdf(recordId).catch((e) =>
          logError("[updateApprovalStatus] 입고증 PDF 생성 실패:", e),
        );
      } else if (type === "OUTBOUND") {
        await generateAndSaveOutboundPdf(recordId).catch((e) =>
          logError("[updateApprovalStatus] 출고증 PDF 생성 실패:", e),
        );
      } else if (type === "EXPENSE") {
        await generateAndSaveExpensePdf(recordId).catch((e) =>
          logError("[updateApprovalStatus] 지출결의서 PDF 생성 실패:", e),
        );
      }
    }

    // 관련 페이지 캐시 초기화 (변경 내용이 즉시 반영되도록)
    revalidatePath("/admin/dashboard");
    revalidatePath("/my-requests");
    revalidatePath("/inventory/status");
    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "서버 오류가 발생했습니다.";
    logError("[updateApprovalStatus] error", msg);
    return { success: false, message: msg };
  }
}
