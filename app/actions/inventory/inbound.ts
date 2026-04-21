"use server";

// ─────────────────────────────────────────────────────────────────────────────
// 입고 신청 처리 모듈
// 직원이 물품 입고를 신청하면 이 파일의 함수들이 순서대로 실행되어
// Airtable(온라인 데이터베이스)에 입고 기록과 재고 기록을 생성합니다.
// ─────────────────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";

// Airtable 접속에 필요한 인증 키와 데이터베이스 ID (환경변수에서 읽어옴)
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

/** 입고 관리 테이블 — env 우선, fallback은 테이블명 */
function inboundTablePath(): string {
  return encodeURIComponent(
    process.env.AIRTABLE_INBOUND_TABLE?.trim() ?? "입고 관리"
  );
}

// Airtable 각 테이블의 필드(열) 이름 상수 정의
const LOT_INBOUND_LINK_FIELD = "입고관리링크";       // LOT별 재고 테이블에서 입고 관리를 연결하는 필드
const INBOUND_WORKER_FIELD = "작업자";               // 입고 신청한 작업자
const INBOUND_PRODUCT_MASTER_FIELD = "품목마스터";   // 입고 품목을 품목 마스터 테이블에 연결하는 필드
const LOT_TABLE_LOT_NUMBER_FIELD = "LOT번호";        // LOT별 재고 테이블의 LOT 번호 필드
const LOT_TABLE_STOCK_FIELD = "재고수량";            // LOT별 재고 테이블의 현재 재고 수량 필드
const INBOUND_LOT_NUMBER_FIELD = "LOT번호";          // 입고 관리 테이블의 LOT 번호 필드

/**
 * 주어진 문자열이 Airtable 레코드 ID 형식인지 확인합니다.
 * Airtable의 모든 행(레코드)은 "rec"으로 시작하는 고유 ID를 가집니다.
 */
function isRecordId(id: string): boolean {
  return /^rec[a-zA-Z0-9]+$/.test(id);
}

/**
 * 서울 시간(KST=UTC+9) 기준 영업일 반환.
 * 오전 9시 이전이면 전날을 영업일로 처리.
 */
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
 * LOT별 재고 테이블 전체를 조회해 마지막 4자리 일련번호의 최댓값을 반환.
 * 새 LOT 번호 = 최댓값 + 1.
 */
async function getMaxLotSequence(): Promise<number> {
  let maxSeq = 0;
  let offset: string | undefined;
  do {
    const params = new URLSearchParams();
    params.append("fields[]", "LOT번호");
    params.append("pageSize", "100");
    if (offset) params.set("offset", offset);
    const res = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/LOT별%20재고?${params}`,
      { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }, next: { revalidate: 0 } }
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

/**
 * 입고일자 문자열을 Airtable에 저장 가능한 날짜 형식(YYYY-MM-DD)으로 변환합니다.
 * 예: "2024.3.5" → "2024-03-05"
 */
function inboundDateForAirtable(raw: unknown): string {
  const s = String(raw ?? "").trim();
  const normalized = s.replace(/\./g, "/").replace(/\s/g, "");
  const dashed = normalized.replace(/\//g, "-");
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(dashed)) {
    const [y, m, d] = dashed.split("-");
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return dashed;
}

/**
 * 작업자 이름으로 작업자 테이블을 검색하여 해당 작업자의 레코드 ID를 반환합니다.
 * 입고 신청 시 작업자를 Airtable 링크 필드로 연결하기 위해 필요합니다.
 */
async function getWorkerRecordIdByName(name: string): Promise<string | null> {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return null;
  const escaped = trimmed.replace(/'/g, "\\'");
  const tablePath = encodeURIComponent("작업자");
  // 작업자명이 일치하는 첫 번째 레코드만 조회
  const formula = encodeURIComponent(`{작업자명}='${escaped}'`);
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tablePath}?filterByFormula=${formula}&maxRecords=1`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[createInventoryRecord] 작업자 조회 실패:", { status: res.status, body: body || "(empty)" });
    return null;
  }
  const data = await res.json();
  const id = data.records?.[0]?.id;
  return typeof id === "string" && isRecordId(id) ? id : null;
}

/**
 * 품목명으로 품목마스터 id + 품목코드 + 기존 LOT 링크 배열 확보.
 * 없으면 신규 품목마스터를 먼저 생성.
 *
 * 품목마스터는 물품의 기본 정보(품목명, 품목코드, 규격 등)를 관리하는 테이블입니다.
 * 처음 입고되는 물품이면 자동으로 품목마스터에 새 항목을 추가합니다.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveProductMasterForInbound(formData: any): Promise<{
  masterId: string;
  productCode: string;
  lotIds: string[];
} | null> {
  const name = String(formData?.["품목명"] ?? "").trim();
  if (!name) {
    console.error("[createInventoryRecord] 품목명 없음");
    return null;
  }
  const escaped = name.replace(/'/g, "\\'");
  const masterTable = encodeURIComponent("품목마스터");
  // 동일 품목명이 이미 있는지 조회
  const formula = encodeURIComponent(`{품목명}='${escaped}'`);
  const getUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${masterTable}?filterByFormula=${formula}&maxRecords=1`;
  const getRes = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    next: { revalidate: 0 },
  });
  const getBody = await getRes.text().catch(() => "");
  if (!getRes.ok) {
    console.error("[createInventoryRecord] 품목마스터 조회 실패:", { status: getRes.status, body: getBody || "(empty)" });
    return null;
  }
  let data: { records?: { id: string; fields?: Record<string, unknown> }[] };
  try {
    data = getBody ? JSON.parse(getBody) : { records: [] };
  } catch {
    console.error("[createInventoryRecord] 품목마스터 조회 응답 파싱 실패:", getBody);
    return null;
  }
  // 기존 품목마스터 레코드가 있으면 해당 ID와 연결된 LOT 목록 반환
  const existing = data.records?.[0];
  if (existing?.id && isRecordId(existing.id)) {
    const rawLots = existing.fields?.["LOT별 재고"];
    const lotIds = Array.isArray(rawLots)
      ? rawLots.filter((x): x is string => typeof x === "string" && isRecordId(x))
      : [];
    const productCode = String(existing.fields?.["품목코드"] ?? "").trim();
    return { masterId: existing.id, productCode, lotIds };
  }

  // 기존 품목마스터가 없으면 신규 생성 (처음 입고되는 품목)
  const postRes = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${masterTable}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          품목명: name,
          품목구분: "미분류",
          권장표기: formData?.["규격"],
          원산지: formData?.["원산지"],
        },
      }),
    }
  );
  const postBody = await postRes.text().catch(() => "");
  if (!postRes.ok) {
    console.error("[createInventoryRecord] 품목마스터(신규) POST 실패:", { status: postRes.status, body: postBody || "(empty)" });
    return null;
  }
  let created: { id?: string; fields?: Record<string, unknown> };
  try {
    created = postBody ? JSON.parse(postBody) : {};
  } catch {
    console.error("[createInventoryRecord] 품목마스터(신규) 응답 파싱 실패:", postBody);
    return null;
  }
  if (!created.id || !isRecordId(created.id)) {
    console.error("[createInventoryRecord] 품목마스터(신규) record id 없음:", postBody);
    return null;
  }
  const productCode = String(created.fields?.["품목코드"] ?? "").trim();
  console.log("[createInventoryRecord] 품목마스터 신규 생성:", { masterId: created.id, productCode });
  return { masterId: created.id, productCode, lotIds: [] };
}

/**
 * LOT번호를 서버에서 직접 조합: YYMMDD-품목코드-규격-[미수숫자-]전체일련번호
 *
 * - 미수: "미" 글자 제거 후 빈 값이면 해당 세그먼트 생략
 * - seq: 전체 LOT 통틀어 최대 일련번호 + 1
 * 예: 260417-MC1-11-26-0001 / 260417-FMC-24-0003
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

/**
 * 입고 신청 메인 함수
 *
 * 직원이 입고 신청 폼을 제출하면 이 함수가 실행됩니다.
 * 아래 순서로 Airtable에 데이터를 저장합니다:
 *   1. 입고 관리 레코드 생성 (승인 대기 상태, LOT번호는 잠시 비워둠)
 *   2. Airtable Auto ID를 읽어 LOT번호를 조합
 *   3. 방금 만든 입고 관리 레코드에 LOT번호를 업데이트(PATCH)
 *   4. LOT별 재고 레코드 생성 (재고수량=0, 승인 후 실제 수량 반영)
 *   5. 품목마스터에 새 LOT 연결
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createInventoryRecord(formData: any) {
  try {
    // 환경변수(API키, 데이터베이스ID) 누락 시 오류 반환
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      console.error("[createInventoryRecord] AIRTABLE_API_KEY / BASE_ID 미설정");
      return { success: false, message: "서버 환경 설정 오류" };
    }

    // 작업자명 또는 레코드 ID로 작업자 확인
    const rawWorker = String(formData?.["작업자"] ?? "").trim();
    const workerRecordId = isRecordId(rawWorker)
      ? rawWorker
      : await getWorkerRecordIdByName(rawWorker);
    if (!workerRecordId) {
      return { success: false, message: "작업자를 찾을 수 없습니다." };
    }

    // 입고 수량 유효성 검사 (0 이하 불가)
    const qty = Number(formData?.["입고수량(BOX)"]);
    if (!Number.isFinite(qty) || qty <= 0) {
      return { success: false, message: "입고 수량이 올바르지 않습니다." };
    }

    // 품목마스터 확인 또는 신규 생성
    const productMaster = await resolveProductMasterForInbound(formData);
    if (!productMaster) {
      return { success: false, message: "품목마스터를 확인할 수 없습니다." };
    }

    const bizDate = inboundDateForAirtable(formData?.["입고일자"]);
    const spec = String(formData?.["규격"] ?? "").trim();
    const misu = String(formData?.["미수"] ?? "").trim();
    const purchasePrice = Number(formData?.["수매가"]);
    const memo = String(formData?.["비고"] ?? "").trim();

    // ── 1. 입고 관리 생성 (LOT번호는 아직 비움) ──
    const inboundFields: Record<string, unknown> = {
      입고일: bizDate,
      미수: misu,
      규격: spec,
      입고수량: qty,
      잔여수량: qty,       // 잔여수량 초기값 = 입고수량 (출고될 때마다 차감됨)
      보관처: String(formData?.["보관처"] ?? ""),
      원산지: String(formData?.["원산지"] ?? ""),
      [INBOUND_WORKER_FIELD]: [workerRecordId],
      [INBOUND_PRODUCT_MASTER_FIELD]: [productMaster.masterId],
      승인상태: "승인 대기",
    };
    const inboundRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${inboundTablePath()}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fields: inboundFields }),
      }
    );
    const inboundBodyRaw = await inboundRes.text().catch(() => "");
    if (!inboundRes.ok) {
      console.error("[createInventoryRecord] 입고 관리 POST 실패:", { status: inboundRes.status, body: inboundBodyRaw || "(empty)" });
      return { success: false, message: "입고 관리 등록 실패" };
    }
    let inboundRecordId: string;
    try {
      const createdInbound = inboundBodyRaw ? JSON.parse(inboundBodyRaw) : null;
      inboundRecordId = createdInbound?.id;
    } catch {
      console.error("[createInventoryRecord] 입고 관리 응답 파싱 실패:", inboundBodyRaw);
      return { success: false, message: "입고 관리 응답 오류" };
    }
    if (!isRecordId(inboundRecordId)) {
      console.error("[createInventoryRecord] 입고 관리 record id 없음:", inboundBodyRaw);
      return { success: false, message: "입고 관리 등록 실패" };
    }

    // ── 2. 영업일 + 전체 일련번호 → LOT번호 생성 ──
    const lotBizDate = getBizDateSeoul();
    const nextSeq = await getMaxLotSequence();
    const lotNumber = buildLotNumber({
      bizDate: lotBizDate,
      productCode: productMaster.productCode,
      spec,
      misu,
      seq: nextSeq,
    });
    console.log("[createInventoryRecord] LOT번호 생성:", lotNumber);

    // ── 3. 입고 관리에 LOT번호 PATCH ──
    // 방금 만든 입고 관리 레코드에 LOT번호를 업데이트합니다
    const inboundPatchRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${inboundTablePath()}/${inboundRecordId}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fields: { [INBOUND_LOT_NUMBER_FIELD]: lotNumber } }),
      }
    );
    const inboundPatchBody = await inboundPatchRes.text().catch(() => "");
    if (!inboundPatchRes.ok) {
      console.error("[createInventoryRecord] 입고 관리 LOT번호 PATCH 실패:", {
        status: inboundPatchRes.status,
        body: inboundPatchBody || "(empty)",
      });
    }

    // ── 4. LOT별 재고 생성 (재고수량=0; 승인 후 실제 수량으로 PATCH) ──
    // 수매가·비고는 입고 관리 테이블에 필드가 없으므로 여기서만 저장
    // 재고수량은 아직 0으로 설정 — 관리자 승인 후 createLotOnInboundApproval()에서 실제 수량으로 변경됨
    const lotFields: Record<string, unknown> = {
      [LOT_INBOUND_LINK_FIELD]: [inboundRecordId],
      [LOT_TABLE_LOT_NUMBER_FIELD]: lotNumber,
      [LOT_TABLE_STOCK_FIELD]: 0,
      품목명: String(formData?.["품목명"] ?? "").trim(),
      규격: spec,
      미수: misu,
      원산지: String(formData?.["원산지"] ?? "").trim(),
      보관처: String(formData?.["보관처"] ?? "").trim(),
      입고일자: bizDate,
      "입고수량(BOX)": qty,
    };
    if (Number.isFinite(purchasePrice) && purchasePrice > 0) {
      lotFields["수매가"] = purchasePrice;
    }
    if (memo) {
      lotFields["비고"] = memo;
    }

    const lotRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/LOT별%20재고`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fields: lotFields }),
      }
    );
    const lotBodyRaw = await lotRes.text().catch(() => "");
    if (!lotRes.ok) {
      console.error("[createInventoryRecord] LOT별 재고 POST 실패:", { status: lotRes.status, body: lotBodyRaw || "(empty)" });
      return { success: false, message: "재고 등록 실패" };
    }
    let createdLot: { id?: string };
    try {
      createdLot = lotBodyRaw ? JSON.parse(lotBodyRaw) : {};
    } catch {
      console.error("[createInventoryRecord] LOT별 재고 응답 파싱 실패:", lotBodyRaw);
      return { success: false, message: "재고 등록 응답 오류" };
    }
    const newLotId = createdLot.id;
    if (!newLotId || !isRecordId(newLotId)) {
      console.error("[createInventoryRecord] LOT record id 없음:", lotBodyRaw);
      return { success: false, message: "재고 등록 실패" };
    }

    // ── 5. 품목마스터 LOT 연결 ──
    // 품목마스터 레코드에 방금 생성한 LOT 재고 레코드를 연결합니다
    const masterTable = encodeURIComponent("품목마스터");
    const patchRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${masterTable}/${productMaster.masterId}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" },
        // 기존 LOT 목록에 새 LOT ID를 추가 (덮어쓰지 않도록 기존 목록 유지)
        body: JSON.stringify({ fields: { "LOT별 재고": [...productMaster.lotIds, newLotId] } }),
      }
    );
    const patchBody = await patchRes.text().catch(() => "");
    if (!patchRes.ok) {
      console.error("[createInventoryRecord] 품목마스터 LOT 연결 PATCH 실패:", { status: patchRes.status, body: patchBody || "(empty)" });
    }

    // 재고 현황 페이지와 관리자 대시보드 캐시 초기화 (최신 데이터 반영)
    revalidatePath("/inventory/status");
    revalidatePath("/admin/dashboard");
    return { success: true };
  } catch (error) {
    console.error("[createInventoryRecord] 예외:", error);
    return { success: false };
  }
}

/**
 * 입고 관리 테이블의 '보관처' Single Select 옵션 목록을 반환한다.
 * Airtable Metadata API 사용.
 *
 * 보관처 선택 드롭다운 메뉴에 표시할 목록을 Airtable에서 가져옵니다.
 * 창고, 냉동고 등 실제 보관 장소명이 반환됩니다.
 */
export async function getStorageOptions(): Promise<string[]> {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!apiKey || !baseId) return [];

  try {
    // Airtable Metadata API로 테이블 구조(필드 목록) 조회
    const res = await fetch(
      `https://api.airtable.com/v0/meta/bases/${baseId}/tables`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        next: { revalidate: 300 }, // 5분 캐시 (자주 바뀌지 않으므로 캐싱 적용)
      }
    );
    if (!res.ok) {
      console.error("[getStorageOptions] Metadata API 실패:", res.status);
      return [];
    }
    const data = await res.json();
    const inboundTableName = process.env.AIRTABLE_INBOUND_TABLE?.trim() ?? "입고 관리";

    // tbl… ID 또는 이름으로 테이블 탐색
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = (data.tables as any[]).find(
      (t) => t.id === inboundTableName || t.name === inboundTableName
    );
    if (!table) {
      console.warn("[getStorageOptions] 입고 관리 테이블을 찾을 수 없음");
      return [];
    }

    // '보관처' 필드가 SingleSelect 타입인지 확인
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const field = (table.fields as any[]).find((f) => f.name === "보관처");
    if (!field || field.type !== "singleSelect") {
      console.warn("[getStorageOptions] 보관처 singleSelect 필드를 찾을 수 없음");
      return [];
    }

    // 선택 옵션 이름만 배열로 반환
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (field.options?.choices ?? []).map((c: any) => String(c.name));
  } catch (e) {
    console.error("[getStorageOptions] 예외:", e);
    return [];
  }
}
