"use server";
import { log, logError, logWarn } from '@/lib/logger';

// ─────────────────────────────────────────────────────────────────────────────
// 출고 신청 처리 모듈
// 직원이 물품 출고를 신청하면 이 파일의 함수들이 실행됩니다.
// LOT 재고 검색 → 잔여수량 확인 → 출고 관리 레코드 생성 순서로 처리됩니다.
// 실제 재고 차감은 관리자가 승인할 때 admin.ts에서 수행됩니다.
// ─────────────────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { AuthError, requireWorker } from "@/lib/server-auth";
import { InputValidationError, sanitizeText } from "@/lib/input-sanitize";

export type OutboundCreatePayload = {
  /** LOT별 재고 레코드 ID (필수) */
  lotRecordId: string;
  /** 입고 관리 레코드 ID (선택 — 없으면 LOT으로부터 조회) */
  inboundRecordId?: string;
  /** 호출 작업자의 record ID — 서버에서 권한 검증용 */
  workerRecordId: string;
  /** 출고 수량(BOX) */
  quantity: number;
  /** 출고일 YYYY-MM-DD */
  date: string;
  /** 규격·원산지·미수·판매처·판매가 — 선택 입력 */
  spec?: string;
  origin?: string;
  misu?: string;
  seller?: string;
  salePrice?: number | string;
  /** LOT번호 표시용 — 서버는 사용하지 않으나 토스트·로그 식별용으로 클라이언트가 함께 전달 */
  lotNumber?: string;
};

// Airtable 접속에 필요한 인증 키와 데이터베이스 ID (환경변수에서 읽어옴)
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

/** 입고 관리 테이블 경로 (URL 인코딩 처리) */
function inboundTablePath(): string {
  return encodeURIComponent(
    process.env.AIRTABLE_INBOUND_TABLE?.trim() ?? "입고 관리"
  );
}

/** 출고 관리 테이블 경로 (URL 인코딩 처리) */
function outboundTablePath(): string {
  return encodeURIComponent(
    process.env.AIRTABLE_OUTBOUND_TABLE?.trim() ?? "출고 관리"
  );
}

/** LOT별 재고 → 입고 관리 링크 필드명(기본 `입고관리링크`). `AIRTABLE_LOT_TO_INBOUND_FIELD` 로 덮어쓰기 가능 */
const LOT_TO_INBOUND_FIELD =
  process.env.AIRTABLE_LOT_TO_INBOUND_FIELD?.trim() || "입고관리링크";
/** 입고 관리에서 출고 후 차감할 잔여 수량 필드명(number) */
const INBOUND_REMAINING_QTY_FIELD = "잔여수량";

/**
 * 주어진 문자열이 Airtable 레코드 ID 형식인지 확인합니다.
 * Airtable의 모든 행(레코드)은 "rec"으로 시작하는 고유 ID를 가집니다.
 */
function isRecordId(id: string): boolean {
  return /^rec[a-zA-Z0-9]+$/.test(id);
}

/**
 * 링크 필드 값(배열 또는 단일 문자열)에서 첫 번째 유효한 레코드 ID를 추출합니다.
 * Airtable 링크 필드는 연결된 레코드 ID의 배열로 저장됩니다.
 */
function firstLinkedRecordId(raw: unknown): string | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const first = raw[0];
  if (typeof first !== "string" || !isRecordId(first)) return null;
  return first;
}

/**
 * LOT별 재고 레코드에서 `LOT_TO_INBOUND_FIELD`(기본 `입고관리링크`)의 첫 linked record id 추출
 * 출고 시 LOT 재고 레코드를 통해 원래 입고 관리 레코드를 찾아야 잔여수량을 차감할 수 있습니다.
 */
async function getInboundRecordIdFromLot(lotRecordId: string): Promise<string | null> {
  const lotTable = encodeURIComponent("LOT별 재고");
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${lotTable}/${lotRecordId}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    logError("[getInboundRecordIdFromLot] LOT 조회 실패:", res.status, lotRecordId);
    return null;
  }
  const data = await res.json();
  const fields = data.fields as Record<string, unknown> | undefined;
  const fieldKeys = fields ? Object.keys(fields) : [];
  log("[getInboundRecordIdFromLot] table:", "LOT별 재고");
  log("[getInboundRecordIdFromLot] recordId:", lotRecordId);
  log("[getInboundRecordIdFromLot] fieldKeys:", fieldKeys);
  log(
    "[getInboundRecordIdFromLot] hasInboundLinkField:",
    fieldKeys.includes(LOT_TO_INBOUND_FIELD),
    "(LOT_TO_INBOUND_FIELD:",
    LOT_TO_INBOUND_FIELD + ")"
  );
  if (!fields) return null;
  const linked = firstLinkedRecordId(fields[LOT_TO_INBOUND_FIELD]);
  if (linked) return linked;
  logError("[getInboundRecordIdFromLot] 링크 없음:", {
    lotRecordId,
    field: LOT_TO_INBOUND_FIELD,
    hasField: LOT_TO_INBOUND_FIELD in fields,
  });
  return null;
}

/**
 * 입고 관리 레코드에서 현재 잔여수량을 읽어옵니다.
 * 출고 수량이 잔여수량을 초과하지 않는지 확인하기 위해 사용됩니다.
 * 보관처 정보도 함께 반환하여 출고 관리에 자동으로 기록합니다.
 */
async function getInboundRemainingQty(
  inboundRecordId: string
): Promise<{ currentQty: number; fieldKeys: string[]; storageId: string } | null> {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${inboundTablePath()}/${inboundRecordId}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    logError("[getInboundRemainingQty] 입고 관리 조회 실패:", {
      inboundRecordId,
      status: res.status,
      responseBody: errBody || "(empty)",
    });
    return null;
  }

  const data = await res.json();
  const fields = data.fields as Record<string, unknown> | undefined;
  const fieldKeys = fields ? Object.keys(fields) : [];
  const rawQty = fields?.[INBOUND_REMAINING_QTY_FIELD];
  const currentQty = Number(rawQty);

  log("[getInboundRemainingQty] fieldKeys:", fieldKeys);
  log("[getInboundRemainingQty] remainingQtyField:", INBOUND_REMAINING_QTY_FIELD);
  log("[getInboundRemainingQty] remainingQtyRaw:", rawQty);

  if (!Number.isFinite(currentQty)) {
    logError("[getInboundRemainingQty] 잔여수량 숫자 변환 실패:", {
      inboundRecordId,
      field: INBOUND_REMAINING_QTY_FIELD,
      rawQty,
    });
    return null;
  }

  const rawStorage = fields?.["보관처"];
  const storageId = Array.isArray(rawStorage) && rawStorage.length > 0 ? String(rawStorage[0]) : "";

  return { currentQty, fieldKeys, storageId };
}

/**
 * [출고용] LOT 일련번호 또는 품목명으로 재고 검색
 *
 * LOT번호 형식이 "YYMMDD-품목코드-규격-[미수-]일련번호"이므로
 * 규격 등 중간 토큰의 우연 매칭을 막기 위해 LOT번호의 끝 일련번호(연속 숫자)에서만 substring 매칭합니다.
 * 품목명은 일반 substring 매칭. 둘 중 하나라도 포함되면 결과에 들어옵니다.
 * 재고수량이 0인 항목은 결과에서 제외합니다.
 */
export async function searchLotByKeyword(keyword: string) {
  try {
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      logError("[searchLotByKeyword] AIRTABLE_API_KEY / AIRTABLE_BASE_ID 미설정");
      return { success: false, records: [], error: "서버 환경 설정 오류" };
    }
    const tableName = encodeURIComponent("LOT별 재고");
    // Airtable formula 문자열 안전화: 백슬래시·작은따옴표 이스케이프
    const escaped = keyword.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const formula = `OR(FIND('${escaped}',REGEX_EXTRACT({LOT번호},'[0-9]+$')),FIND('${escaped}',{품목명}))`;
    const response = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableName}?filterByFormula=${encodeURIComponent(formula)}`,
      {
        headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
        next: { revalidate: 0 }
      }
    );

    if (!response.ok) {
      let msg = `HTTP ${response.status}`;
      try {
        const errBody = await response.json();
        msg = errBody?.error?.message ?? msg;
      } catch {
        /* ignore */
      }
      logError("[searchLotByKeyword] Airtable 응답 실패:", msg);
      return { success: false, records: [], error: msg };
    }

    type AirtableRecord = { id: string; fields: Record<string, unknown> };
    const data = (await response.json()) as { records?: AirtableRecord[] };
    // 재고수량이 1 이상인 항목만 필터링 (소진된 재고 제외)
    const records: AirtableRecord[] = (data.records ?? []).filter((r) => {
      const raw = r.fields?.["재고수량"];
      const qty = Number(Array.isArray(raw) ? raw[0] : raw) || 0;
      return qty > 0;
    });

    // 보관처 link → 이름 변환 (보관처 마스터 전체 fetch 1회, 5분 캐시)
    const masterRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent("보관처 마스터")}?fields[]=${encodeURIComponent("보관처명")}&pageSize=100`,
      { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }, next: { revalidate: 300 } }
    );
    if (masterRes.ok) {
      const masterData = (await masterRes.json()) as { records?: AirtableRecord[] };
      const storageNameMap = new Map<string, string>();
      for (const r of masterData.records ?? []) {
        storageNameMap.set(r.id, String(r.fields?.["보관처명"] ?? ""));
      }
      for (const record of records) {
        const raw = record.fields?.["보관처"];
        if (Array.isArray(raw) && raw.length > 0) {
          record.fields["보관처"] = storageNameMap.get(raw[0]) ?? "";
        }
      }
    }

    return { success: true, records };
  } catch (error) {
    logError("🔴 출고 검색 에러:", error);
    return { success: false, records: [], error: "검색 중 서버 오류" };
  }
}

/**
 * [출고용] 출고 내역 등록
 *
 * 직원이 출고 신청 폼을 제출하면 이 함수가 실행됩니다.
 * 아래 순서로 처리됩니다:
 *   1. LOT 레코드 ID와 작업자 유효성 확인
 *   2. 입고 관리의 잔여수량 조회 → 출고 수량이 초과하면 즉시 실패 반환
 *   3. 출고 관리 레코드 생성 (승인 대기 상태)
 * 실제 재고 차감(잔여수량 감소)은 관리자 승인 시 admin.ts에서 처리됩니다.
 */
export async function createOutboundRecord(payload: OutboundCreatePayload) {
  try {
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      logError("[createOutboundRecord] AIRTABLE_API_KEY / AIRTABLE_BASE_ID 미설정");
      return { success: false, error: "서버 환경 설정 오류" };
    }

    // 작업자 권한 검증 (Airtable 조회 — 활성 작업자인지 확인)
    let verified;
    try {
      verified = await requireWorker(payload?.workerRecordId);
    } catch (e) {
      if (e instanceof AuthError) {
        logWarn("[createOutboundRecord] 권한 거부:", e.code, e.message);
        return { success: false, error: e.message };
      }
      throw e;
    }
    const workerRecordId = verified.id;

    /** LOT별 재고 행 id (검색·선택 결과의 `id`) */
    const lotInventoryRecordId =
      typeof payload?.lotRecordId === "string" ? payload.lotRecordId.trim() : "";
    if (!isRecordId(lotInventoryRecordId)) {
      return { success: false, error: "LOT 레코드 ID가 필요합니다." };
    }

    // payload에서 입고 관리 레코드 ID를 직접 받거나, 없으면 LOT 레코드를 통해 조회
    const inboundFromPayload =
      typeof payload?.inboundRecordId === "string"
        ? payload.inboundRecordId.trim()
        : "";
    const inboundRecordId = isRecordId(inboundFromPayload)
      ? inboundFromPayload
      : await getInboundRecordIdFromLot(lotInventoryRecordId);
    if (!inboundRecordId) {
      return {
        success: false,
        error: `LOT에 연결된 입고 관리 레코드를 찾을 수 없습니다. (링크 필드: ${LOT_TO_INBOUND_FIELD})`,
      };
    }

    // 출고 수량 유효성 검사
    const qty = Number(payload?.quantity ?? 0);
    if (!Number.isFinite(qty) || qty <= 0) {
      return { success: false, error: "출고 수량이 올바르지 않습니다." };
    }

    // 입고 관리의 현재 잔여수량 조회 — 재고 부족 시 출고 불가
    const inboundRemain = await getInboundRemainingQty(inboundRecordId);
    if (!inboundRemain) {
      return {
        success: false,
        error: `입고 관리의 ${INBOUND_REMAINING_QTY_FIELD}를 확인할 수 없습니다.`,
      };
    }
    const { currentQty: currentRemain, storageId } = inboundRemain;
    if (qty > currentRemain) {
      // 출고 요청 수량이 잔여 재고보다 많으면 신청 자체를 거부
      logError("[createOutboundRecord] 잔여수량 부족(출고 관리 미생성):", {
        inboundRecordId,
        qty,
        currentRemain,
      });
      return {
        success: false,
        error: `입고 관리 ${INBOUND_REMAINING_QTY_FIELD}가 부족합니다. (잔여: ${currentRemain}, 출고: ${qty})`,
      };
    }

    // 자유 텍스트 필드 정규화·길이 검사 (판매처 30자)
    let seller: string;
    try {
      seller = sanitizeText(payload?.seller, "seller", "판매처");
    } catch (e) {
      if (e instanceof InputValidationError) return { success: false, error: e.message };
      throw e;
    }

    // 출고 관리 레코드에 저장할 필드 구성
    const fields: Record<string, unknown> = {
      "출고일": payload?.date,
      "LOT번호": [inboundRecordId],         // 입고 관리 레코드 링크 (출고 승인 시 잔여수량 차감용)
      "출고수량": qty,
      "작업자": [workerRecordId],
      "승인상태": "승인 대기",
      "LOT재고레코드ID": lotInventoryRecordId, // LOT별 재고 레코드 ID (승인 시 재고수량 차감용)
    };
    // 선택적 필드: 값이 있을 때만 추가
    if (payload?.spec) fields["규격"] = String(payload.spec);
    if (payload?.origin) fields["원산지"] = String(payload.origin);
    if (payload?.misu) fields["미수"] = String(payload.misu);
    if (storageId) fields["보관처"] = [storageId]; // 입고 관리에서 보관처 link 복사
    if (seller) fields["판매처"] = seller;
    if (payload?.salePrice != null && payload.salePrice !== "") fields["판매가"] = Number(payload.salePrice);

    const postUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${outboundTablePath()}`;
    const requestBody = JSON.stringify({ fields });

    log("[createOutboundRecord] POST table:", process.env.AIRTABLE_OUTBOUND_TABLE?.trim() ?? "출고 관리");
    log("[createOutboundRecord] POST fields:", JSON.stringify(fields));

    const response = await fetch(postUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: requestBody,
    });

    const responseBodyRaw = await response.text().catch(() => "");
    log("[createOutboundRecord] POST response.status:", response.status);
    log("[createOutboundRecord] POST response.ok:", response.ok);
    log("[createOutboundRecord] POST response.body (raw):", responseBodyRaw || "(empty)");

    if (!response.ok) {
      let message = "저장 실패";
      let errorType: string | undefined;
      try {
        const errorData = responseBodyRaw ? JSON.parse(responseBodyRaw) : null;
        message = errorData?.error?.message ?? message;
        errorType = errorData?.error?.type;
      } catch {
        message = responseBodyRaw?.trim()
          ? responseBodyRaw.slice(0, 500)
          : `HTTP ${response.status}`;
      }
      logError("[createOutboundRecord] POST 실패 — 명시 처리:", {
        table: process.env.AIRTABLE_OUTBOUND_TABLE?.trim() ?? "출고 관리",
        status: response.status,
        ok: response.ok,
        errorType,
        message,
        requestFields: fields,
        responseBodyRaw: responseBodyRaw || "(empty)",
      });
      return { success: false, error: message };
    }

    try {
      const created = responseBodyRaw ? JSON.parse(responseBodyRaw) : null;
      log("[createOutboundRecord] POST 성공:", {
        createdRecordId: created?.id ?? null,
        createdFieldKeys:
          created?.fields && typeof created.fields === "object"
            ? Object.keys(created.fields as object)
            : [],
      });
    } catch {
      log("[createOutboundRecord] POST 성공(본문 JSON 파싱 생략)");
    }

    // 관리자 대시보드 캐시 초기화 (새 출고 신청이 바로 보이도록)
    revalidatePath("/admin/dashboard");
    return { success: true };
  } catch (error) {
    logError("[createOutboundRecord] 예외:", error);
    const msg = error instanceof Error ? error.message : "서버 오류가 발생했습니다.";
    return { success: false, error: msg };
  }
}
