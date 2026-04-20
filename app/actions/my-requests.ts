"use server";

// ─────────────────────────────────────────────────────────────────────────────
// 신청 내역 조회 모듈
// 입고 관리, 출고 관리, 지출결의 세 테이블의 데이터를 한꺼번에 불러와
// 화면에 표시하기 위한 통합 목록을 만들어 반환합니다.
//
// 주요 기능:
//  - getMyRequests(): 전체 또는 특정 직원의 신청 내역 조회 (내 신청 / 관리자 대시보드 공용)
//  - cancelMyRequest(): 대기 중인 신청 건 취소
// ─────────────────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { getWorkersTablePath, getProductsTablePath } from "@/lib/airtable";
import { WORKER_FIELDS, PRODUCT_FIELDS } from "@/lib/airtable-schema";

/** 입고/출고: 작업자 링크 필드 후보(첫 번째로 rec id가 나오는 필드만 사용) */
const WORKER_LINK_FIELD_CANDIDATES = ["작업자"] as const;
/** 지출결의: 신청자 링크 필드 후보 */
const APPLICANT_LINK_FIELD_CANDIDATES = ["신청자"] as const;
/** 입고/출고 → 품목 마스터 링크 필드 후보 */
const PRODUCT_LINK_FIELD_CANDIDATES = ["품목마스터", "품목"] as const;

// Airtable 접속에 필요한 인증 키와 데이터베이스 ID (환경변수에서 읽어옴)
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

/**
 * 테이블 이름을 URL에 사용할 수 있는 형태로 변환합니다.
 * tbl… 형식의 ID는 그대로 사용하고, 한글 테이블명은 URL 인코딩 처리합니다.
 */
function tableSegmentForUrl(tableName: string): string {
  const t = tableName.trim();
  if (/^tbl[0-9a-zA-Z]+$/i.test(t)) return t;
  if (/%[0-9A-Fa-f]{2}/.test(t)) return t;
  return encodeURIComponent(t);
}

/**
 * 화면에 표시할 신청 항목의 데이터 구조 정의
 * 입고·출고·지출결의의 데이터를 이 구조로 통일하여 화면에서 동일하게 처리합니다.
 */
export type RequestItem = {
  id: string;
  type: "INBOUND" | "OUTBOUND" | "EXPENSE"; // 신청 유형
  title: string;                             // 표시 제목 (품목명 또는 건명)
  date: string;                              // 신청 날짜
  status: "승인 대기" | "승인 완료" | "반려" | "취소" | "최종 승인 대기";
  amountOrQuantity: string;                  // 수량(입고/출고) 또는 금액(지출)
  requester: string;                         // 신청자 이름
  /** Airtable 레코드 생성 시각(있으면 정렬·표시용) */
  createdTime?: string;
  rejectReason?: string;                     // 반려 시 반려 사유
  lotNumber?: string;                        // LOT 번호 (입고/출고에만 있음)
  spec?: string;                             // 규격
  misu?: string;                             // 미수 정보
  raw: Record<string, unknown>;              // Airtable에서 받은 원본 데이터 전체
};

/** Airtable API에서 반환되는 레코드(행) 데이터 구조 */
type AirtableListRecord = {
  id: string;
  fields: Record<string, unknown>;
  createdTime?: string;
};

/**
 * Airtable 테이블에서 레코드 목록을 조회합니다.
 * 필터 조건과 정렬 기준을 선택적으로 적용할 수 있습니다.
 */
async function fetchAirtableRecords(
  tableName: string,
  filterFormula?: string,
  sortField?: string,
): Promise<AirtableListRecord[]> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) return [];

  const params = new URLSearchParams();
  if (filterFormula) params.set("filterByFormula", filterFormula);
  if (sortField) {
    params.set("sort[0][field]", sortField);
    params.set("sort[0][direction]", "desc"); // 최신순(내림차순) 정렬
  }

  try {
    const res = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableSegmentForUrl(tableName)}?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
        cache: "no-store", // 항상 최신 데이터를 가져오도록 캐시 사용 안 함
      },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const rows = (data.records ?? []) as {
      id?: string;
      fields?: Record<string, unknown>;
      createdTime?: string;
    }[];
    return rows.map((rec) => ({
      id: String(rec.id ?? ""),
      fields: rec.fields ?? {},
      createdTime: typeof rec.createdTime === "string" ? rec.createdTime : undefined,
    }));
  } catch {
    return [];
  }
}

/**
 * 필드값에서 Airtable 레코드 ID를 추출합니다.
 * 링크 필드는 배열로, 단일 필드는 문자열로 저장될 수 있어 두 경우 모두 처리합니다.
 */
function firstRecordId(val: unknown): string | null {
  if (typeof val === "string" && /^rec[a-zA-Z0-9]+$/.test(val.trim())) return val.trim();
  if (Array.isArray(val)) {
    for (const v of val) {
      if (typeof v === "string" && /^rec[a-zA-Z0-9]+$/.test(v.trim())) return v.trim();
    }
  }
  return null;
}

/**
 * 여러 필드명 중 첫 번째로 링크 rec id가 있는 필드만 사용(룩업 문자열은 무시)
 * Airtable 룩업/롤업 필드는 연결된 값을 텍스트로 복사해오는데,
 * 이런 필드는 rec ID가 아니므로 제외해야 합니다.
 */
function firstRecordIdFromFields(
  fields: Record<string, unknown>,
  keys: readonly string[],
): { id: string | null; sourceKey: string | null; linkRawByKey: Record<string, unknown> } {
  const linkRawByKey: Record<string, unknown> = {};
  for (const key of keys) {
    linkRawByKey[key] = fields[key];
    const id = firstRecordId(fields[key]);
    if (id) return { id, sourceKey: key, linkRawByKey };
  }
  return { id: null, sourceKey: null, linkRawByKey };
}

/**
 * Airtable 필드값을 화면에 표시할 문자열로 변환합니다.
 * 배열 형태로 저장된 경우 첫 번째 유효한 문자열을 반환합니다.
 */
function fieldToDisplayString(val: unknown): string {
  if (typeof val === "string" && val.trim()) return val.trim();
  if (Array.isArray(val)) {
    for (const v of val) {
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return "";
}

/**
 * 승인상태 문자열을 정의된 상태값으로 정규화합니다.
 * 알 수 없는 상태값이 들어오면 기본값 "승인 대기"로 처리합니다.
 */
function normalizeStatus(raw: string): RequestItem["status"] {
  const VALID: RequestItem["status"][] = ["승인 대기", "승인 완료", "반려", "취소", "최종 승인 대기"];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return VALID.includes(raw as any) ? (raw as RequestItem["status"]) : "승인 대기";
}

/**
 * record ID 배열 → { recXXX: "이름" } 맵 반환.
 * Airtable GET records by ID (최대 10개씩 batch).
 *
 * 여러 레코드의 이름을 한번에 조회하는 최적화 함수입니다.
 * 개별 조회보다 훨씬 빠르게 작업자명이나 품목명을 일괄 확인할 수 있습니다.
 */
async function batchResolveNames(
  tableName: string,
  recordIds: string[],
  nameField: string,
): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || recordIds.length === 0) return map;

  const unique = [...new Set(recordIds)]; // 중복 ID 제거
  const chunks: string[][] = [];
  // Airtable API는 한 번에 최대 10개 조회 가능하므로 10개씩 나눔
  for (let i = 0; i < unique.length; i += 10) {
    chunks.push(unique.slice(i, i + 10));
  }

  for (const chunk of chunks) {
    // OR 조건으로 여러 레코드를 한번에 조회
    const formula = `OR(${chunk.map((id) => `RECORD_ID()='${id}'`).join(",")})`;
    const params = new URLSearchParams({
      filterByFormula: formula,
      "fields[]": nameField, // 이름 필드만 요청 (불필요한 데이터 제외)
    });
    try {
      const res = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableSegmentForUrl(tableName)}?${params.toString()}`,
        { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }, cache: "no-store" },
      );
      if (!res.ok) continue;
      const data = await res.json();
      for (const r of data.records ?? []) {
        const name = fieldToDisplayString(r.fields?.[nameField]);
        if (name) map[r.id] = name;
      }
    } catch {
      /* skip */
    }
  }
  return map;
}

/**
 * 특정 작업자 ID로 작업자명 단건 조회합니다.
 * 배치 조회 결과에 없는 경우의 보완 조회용입니다.
 */
async function fetchWorkerNameByRecordId(
  workerTablePath: string,
  recordId: string,
): Promise<string> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !/^rec[a-zA-Z0-9]+$/.test(recordId)) return "";
  try {
    const res = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableSegmentForUrl(workerTablePath)}/${recordId}`,
      { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }, cache: "no-store" },
    );
    if (!res.ok) return "";
    const data = (await res.json()) as { fields?: Record<string, unknown> };
    return fieldToDisplayString(data.fields?.[WORKER_FIELDS.name]);
  } catch {
    return "";
  }
}

/**
 * 배치 룩업에 빠진 작업자 id는 단건 조회로 보강 (env 테이블 경로 불일치 등 대비)
 * 배치 조회에서 누락된 작업자가 있으면 개별적으로 다시 조회하여 이름 맵을 채웁니다.
 */
async function fillMissingWorkerNames(
  workerTablePath: string,
  ids: string[],
  map: Record<string, string>,
): Promise<void> {
  const unique = [...new Set(ids.filter((id) => /^rec[a-zA-Z0-9]+$/.test(id)))];
  for (const id of unique) {
    if (map[id]) continue; // 이미 이름이 있으면 건너뜀
    const name = await fetchWorkerNameByRecordId(workerTablePath, id);
    if (name) map[id] = name;
  }
}

/**
 * 특정 품목 ID로 품목명 단건 조회합니다.
 * 배치 조회 결과에 없는 경우의 보완 조회용입니다.
 */
async function fetchProductNameByRecordId(
  productTablePath: string,
  recordId: string,
): Promise<string> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !/^rec[a-zA-Z0-9]+$/.test(recordId)) return "";
  try {
    const res = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableSegmentForUrl(productTablePath)}/${recordId}`,
      { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }, cache: "no-store" },
    );
    if (!res.ok) return "";
    const data = (await res.json()) as { fields?: Record<string, unknown> };
    return fieldToDisplayString(data.fields?.[PRODUCT_FIELDS.name]);
  } catch {
    return "";
  }
}

/**
 * 배치 룩업에 빠진 품목 id는 단건 조회로 보강합니다.
 */
async function fillMissingProductNames(
  productTablePath: string,
  ids: string[],
  map: Record<string, string>,
): Promise<void> {
  const unique = [...new Set(ids.filter((id) => /^rec[a-zA-Z0-9]+$/.test(id)))];
  for (const id of unique) {
    if (map[id]) continue; // 이미 이름이 있으면 건너뜀
    const name = await fetchProductNameByRecordId(productTablePath, id);
    if (name) map[id] = name;
  }
}

/**
 * 신청자 필터 조건 적용 함수
 * - requesterWorkerId(레코드 ID)가 있으면 ID로 정확히 비교 (권장)
 * - requesterName(이름 문자열)만 있으면 이름으로 비교 (표기 차이에 취약)
 * - 둘 다 없으면 모든 항목 통과 (전체 조회)
 */
function passesRequesterFilter(
  requesterWorkerId: string | undefined,
  requesterName: string | undefined,
  workerLinkId: string | null,
  displayRequester: string,
): boolean {
  const id = requesterWorkerId?.trim();
  if (id) {
    const wid = workerLinkId?.trim() ?? "";
    return wid.length > 0 && wid === id;
  }
  const name = requesterName?.trim();
  if (name) {
    return displayRequester.trim() === name;
  }
  return true; // 필터 없으면 전체 통과
}

/**
 * 신청 항목을 시간순으로 정렬하기 위한 타임스탬프 반환
 * createdTime(Airtable 레코드 생성 시각)이 있으면 우선 사용
 */
function sortTimestamp(item: RequestItem): number {
  if (item.createdTime) {
    const t = Date.parse(item.createdTime);
    if (Number.isFinite(t)) return t;
  }
  const d = Date.parse(item.date);
  return Number.isFinite(d) ? d : 0;
}

/**
 * 내 신청 내역 조회 (입고 관리 + 출고 관리 + 지출결의)
 * @param requesterName — 레거시: 작업자명 문자열 일치 필터 (공백·표기 차이에 취약)
 * @param requesterWorkerId — 권장: 작업자 테이블 record id와 링크 필드 직접 비교
 * 둘 다 비면 전체 조회. requesterWorkerId가 있으면 id 기준만 사용.
 *
 * 이 함수는 세 테이블을 동시에 조회한 후, 작업자명·품목명을 추가로 조회하여
 * 화면에 표시할 수 있는 통합 목록을 최신순으로 반환합니다.
 */
export async function getMyRequests(
  requesterName?: string,
  requesterWorkerId?: string,
): Promise<RequestItem[]> {
  const workerTablePath = getWorkersTablePath();
  const productTablePath = getProductsTablePath();

  // 세 테이블을 동시에 조회 (순서대로 기다리지 않고 병렬 실행으로 속도 최적화)
  const [inboundRaw, outboundRaw, expenseRaw] = await Promise.all([
    fetchAirtableRecords("입고 관리"),
    fetchAirtableRecords("출고 관리"),
    fetchAirtableRecords("지출결의"),
  ]);

  // ── 1단계: 링크 rec id 수집(룩업 문자열 제외, 필드명 후보만) ──
  // 뒤이어 이름 일괄 조회를 위해 먼저 모든 링크 ID를 수집
  const workerIds: string[] = [];
  const productIds: string[] = [];
  const lotIds: string[] = [];

  for (const r of [...inboundRaw, ...outboundRaw]) {
    const w = firstRecordIdFromFields(r.fields, WORKER_LINK_FIELD_CANDIDATES);
    if (w.id) workerIds.push(w.id);
    const p = firstRecordIdFromFields(r.fields, PRODUCT_LINK_FIELD_CANDIDATES);
    if (p.id) productIds.push(p.id);
    const lId = firstRecordId(r.fields["LOT번호"]);
    if (lId) lotIds.push(lId);
  }

  for (const r of expenseRaw) {
    const w = firstRecordIdFromFields(r.fields, APPLICANT_LINK_FIELD_CANDIDATES);
    if (w.id) workerIds.push(w.id);
  }

  // ── 2단계: 배치 조회(작업자명·품목명·LOT) + 링크 id 단건 보강 ──
  // ID 목록으로 이름을 한꺼번에 조회 (10개씩 묶어서 처리)
  const [workerMap, productMap, lotMap] = await Promise.all([
    batchResolveNames(workerTablePath, workerIds, WORKER_FIELDS.name),
    batchResolveNames(productTablePath, productIds, PRODUCT_FIELDS.name),
    batchResolveNames("입고 관리", lotIds, "LOT번호"),
  ]);

  // 배치 조회에서 빠진 항목은 개별 조회로 보완
  await fillMissingWorkerNames(workerTablePath, workerIds, workerMap);
  await fillMissingProductNames(productTablePath, productIds, productMap);

  const workerSample = Object.fromEntries(Object.entries(workerMap).slice(0, 3));
  const productSample = Object.fromEntries(Object.entries(productMap).slice(0, 3));
  console.log("[getMyRequests] workerMap size=", Object.keys(workerMap).length, "sample=", workerSample);
  console.log("[getMyRequests] productMap size=", Object.keys(productMap).length, "sample=", productSample);

  const items: RequestItem[] = [];

  // ── 입고 관리 레코드 처리 ──
  for (const r of inboundRaw) {
    const f = r.fields;

    // 신청자(작업자) 링크 ID를 추출하고, 이름 맵에서 실제 이름을 조회
    const wLink = firstRecordIdFromFields(f, WORKER_LINK_FIELD_CANDIDATES);
    const wId = wLink.id;
    const requester = wId ? (workerMap[wId] ?? "") : "";
    const passReq = passesRequesterFilter(requesterWorkerId, requesterName, wId, requester);
    console.log(
      JSON.stringify({
        type: "INBOUND",
        id: r.id,
        requesterLinkRaw: wLink.linkRawByKey,
        requesterLinkField: wLink.sourceKey,
        resolvedWorkerLinkId: wId,
        resolvedRequesterName: requester,
        sessionWorkerId: requesterWorkerId ?? null,
        passesRequesterFilter: passReq,
      }),
    );
    if (!passReq) continue; // 신청자 필터에 맞지 않으면 목록에서 제외

    // 품목 링크 ID로 품목명 조회
    const pLink = firstRecordIdFromFields(f, PRODUCT_LINK_FIELD_CANDIDATES);
    const pId = pLink.id;
    const productName = pId ? (productMap[pId] ?? "") : "";
    console.log(
      JSON.stringify({
        type: "INBOUND",
        id: r.id,
        productLinkRaw: pLink.linkRawByKey,
        productLinkField: pLink.sourceKey,
        resolvedProductLinkId: pId,
        resolvedProductName: productName,
      }),
    );

    const rawStatus = String(f["승인상태"] ?? "승인 대기").trim();
    const status = normalizeStatus(rawStatus);

    // 입고수량 필드명이 다를 수 있어 두 가지 후보 확인
    const qty = f["입고수량"] ?? f["입고수량(BOX)"] ?? "";
    const spec = String(f["규격"] ?? "");
    const misu = String(f["미수"] ?? "");
    const lotNumber = String(f["LOT번호"] ?? "");

    items.push({
      id: r.id,
      type: "INBOUND",
      title: (productName && productName.trim()) || "입고 신청",
      date: String(f["입고일"] ?? f["입고일자"] ?? "").slice(0, 10),
      status,
      amountOrQuantity: qty ? `${Number(qty).toLocaleString("ko-KR")}` : "-",
      requester,
      createdTime: r.createdTime,
      rejectReason: String(f["반려사유"] ?? ""),
      lotNumber,
      spec,
      misu,
      raw: f,
    });
  }

  // 출고 레코드에서 품목명을 찾기 위한 보조 맵 구성
  // 출고 → 입고 링크 → 품목마스터 경로로 품목명을 추적할 때 사용
  const inboundProductMap: Record<string, string> = {};
  for (const r of inboundRaw) {
    const p = firstRecordIdFromFields(r.fields, PRODUCT_LINK_FIELD_CANDIDATES);
    if (p.id) inboundProductMap[r.id] = p.id;
  }

  // ── 출고 관리 레코드 처리 ──
  for (const r of outboundRaw) {
    const f = r.fields;

    // 신청자(작업자) 링크 ID로 이름 조회
    const wLink = firstRecordIdFromFields(f, WORKER_LINK_FIELD_CANDIDATES);
    const wId = wLink.id;
    const requester = wId ? (workerMap[wId] ?? "") : "";
    const passReq = passesRequesterFilter(requesterWorkerId, requesterName, wId, requester);
    console.log(
      JSON.stringify({
        type: "OUTBOUND",
        id: r.id,
        requesterLinkRaw: wLink.linkRawByKey,
        requesterLinkField: wLink.sourceKey,
        resolvedWorkerLinkId: wId,
        resolvedRequesterName: requester,
        sessionWorkerId: requesterWorkerId ?? null,
        passesRequesterFilter: passReq,
      }),
    );
    if (!passReq) continue;

    // 출고의 LOT번호 link (로직용: 입고 관리 record ID)
    const lotLinkId = firstRecordId(f["LOT번호"]);
    const lotDisplay = f["LOT번호(표시용)"];
    // 표시용 LOT번호: 롤업 필드 → 입고 관리 LOT번호 텍스트 순서로 시도
    const lotNumber =
      (Array.isArray(lotDisplay) ? String(lotDisplay[0] ?? "") : String(lotDisplay ?? "")).trim() ||
      (lotLinkId && lotMap[lotLinkId]) ||
      "";

    // 품목명: 출고 직접 링크보다 LOT → 입고 관리 → 품목마스터 경로를 우선 사용
    const directPl = firstRecordIdFromFields(f, PRODUCT_LINK_FIELD_CANDIDATES);
    let productName = "";
    if (lotLinkId) {
      const linkedProductId = inboundProductMap[lotLinkId];
      if (linkedProductId && productMap[linkedProductId]) {
        productName = productMap[linkedProductId];
      }
    }
    // LOT 경로에서 품목명을 찾지 못했으면 직접 링크 시도
    if (!productName && directPl.id && productMap[directPl.id]) {
      productName = productMap[directPl.id];
    }
    const viaLotPid = lotLinkId ? inboundProductMap[lotLinkId] ?? null : null;
    console.log(
      JSON.stringify({
        type: "OUTBOUND",
        id: r.id,
        lotLinkRaw: f["LOT번호"],
        inboundFromLotProductLinkId: viaLotPid,
        directProductLinkRaw: directPl.linkRawByKey,
        directProductLinkField: directPl.sourceKey,
        resolvedProductLinkId: viaLotPid || directPl.id,
        resolvedProductName: productName,
      }),
    );

    const rawStatus = String(f["승인상태"] ?? "승인 대기").trim();
    const status = normalizeStatus(rawStatus);

    const qty = f["출고수량"] ?? "";
    const spec = String(f["규격"] ?? "");
    const misu = String(f["미수"] ?? "");

    items.push({
      id: r.id,
      type: "OUTBOUND",
      title: (productName && productName.trim()) || "출고 신청",
      date: String(f["출고일"] ?? "").slice(0, 10),
      status,
      amountOrQuantity: qty ? `${Number(qty).toLocaleString("ko-KR")}` : "-",
      requester,
      createdTime: r.createdTime,
      rejectReason: String(f["반려사유"] ?? ""),
      lotNumber,
      spec,
      misu,
      raw: f,
    });
  }

  // ── 지출결의 레코드 처리 ──
  for (const r of expenseRaw) {
    const f = r.fields;
    // 지출결의는 '신청자' 필드가 작업자 링크
    const wLink = firstRecordIdFromFields(f, APPLICANT_LINK_FIELD_CANDIDATES);
    const wId = wLink.id;
    const requester = wId ? (workerMap[wId] ?? "") : "";
    const passReq = passesRequesterFilter(requesterWorkerId, requesterName, wId, requester);
    console.log(
      JSON.stringify({
        type: "EXPENSE",
        id: r.id,
        requesterLinkRaw: wLink.linkRawByKey,
        requesterLinkField: wLink.sourceKey,
        resolvedWorkerLinkId: wId,
        resolvedRequesterName: requester,
        sessionWorkerId: requesterWorkerId ?? null,
        passesRequesterFilter: passReq,
      }),
    );
    if (!passReq) continue;

    const rawStatus = String(f["승인상태"] ?? "승인 대기").trim();
    const status = normalizeStatus(rawStatus);

    const amount = Number(f["금액"] ?? 0);

    items.push({
      id: r.id,
      type: "EXPENSE",
      title: String(f["건명"] ?? "지출 결의"),
      date: String(f["작성일"] ?? f["지출일"] ?? "").slice(0, 10),
      status,
      // 금액은 한국 원화 형식으로 포맷 (예: 1,500,000원)
      amountOrQuantity: amount > 0 ? `${amount.toLocaleString("ko-KR")}원` : "-",
      requester,
      createdTime: r.createdTime,
      rejectReason: String(f["반려사유"] ?? ""),
      raw: f,
    });
  }

  console.log("[getMyRequests] 최종 합계:", items.length, "건 (입고:", inboundRaw.length, "/ 출고:", outboundRaw.length, "/ 지출:", expenseRaw.length, ")");
  // Airtable createdTime 기준 내림차순 정렬 (최신 신청 건이 위에 표시)
  items.sort((a, b) => sortTimestamp(b) - sortTimestamp(a));
  return items;
}

/**
 * 신청 건 취소
 *
 * 아직 승인되지 않은 신청 건을 취소 상태로 변경합니다.
 * "내 신청 내역" 화면에서 취소 버튼을 누를 때 호출됩니다.
 * 승인이 완료된 건은 취소할 수 없습니다(Airtable에서 상태를 바꾸면 되지만,
 * 이 함수는 단순히 상태를 "취소"로 업데이트할 뿐 추가 검증은 하지 않습니다).
 */
export async function cancelMyRequest(recordId: string, type: "INBOUND" | "OUTBOUND" | "EXPENSE") {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    return { success: false, message: "환경변수 설정이 누락되었습니다." };
  }

  // 신청 유형에 따라 업데이트할 Airtable 테이블 결정
  const tableMap: Record<string, string> = {
    EXPENSE: "지출결의",
    INBOUND: "입고 관리",
    OUTBOUND: "출고 관리",
  };
  const tableName = tableMap[type] ?? "입고 관리";

  try {
    const res = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}/${recordId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields: { "승인상태": "취소" } }), // 승인상태를 "취소"로 변경
      },
    );

    if (!res.ok) {
      return { success: false, message: "취소 요청에 실패했습니다." };
    }

    // 내 신청 내역과 관리자 대시보드 캐시 초기화
    revalidatePath("/my-requests");
    revalidatePath("/admin/dashboard");
    return { success: true, message: "취소되었습니다." };
  } catch {
    return { success: false, message: "서버 오류가 발생했습니다." };
  }
}
