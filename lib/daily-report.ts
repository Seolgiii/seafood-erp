import "server-only";
import { getMyRequests } from "@/app/actions/my-requests";
import type { RequestItem } from "@/app/actions/my-requests";
import { seoulDateString } from "@/lib/date";

/**
 * 일일 정산 보고서
 *
 * 기준 날짜: "어제" = 입고일/출고일/이동일/지출일 (사용자 입력 날짜, createdTime 아님)
 *  - 어제 정산: 해당 날짜 + 승인 완료 상태인 건들 (실제 재고가 움직인 정산)
 *  - 결재 대기: 어제 신청 미결재 + 그 외 누적 미결재 분리 표시
 *  - 손익 요약: 출고 판매금액 합 - 입고 수매가 합 - 지출 합
 */

const STALE_MS = 24 * 60 * 60 * 1000;

// ──────────────────────────────────────────────
// 데이터 타입
// ──────────────────────────────────────────────

export interface InboundLine {
  productName: string;
  spec: string;
  misu: string;
  qty: number;
  purchasePrice: number; // 박스당 수매가
}

export interface OutboundLine {
  buyer: string;
  productName: string;
  spec: string;
  misu: string;
  qty: number;
  remaining: number; // 현재 LOT 잔여 박스
  salePrice: number; // 박스당 판매가
}

export interface TransferLine {
  productName: string;
  spec: string;
  qty: number;
}

export interface ExpenseSummary {
  count: number;
  totalAmount: number;
}

export interface PendingByType {
  INBOUND: number;
  OUTBOUND: number;
  EXPENSE: number;
  TRANSFER: number;
}

export interface DailyReport {
  /** 어제 날짜 (YYYY-MM-DD) — 정산 대상일 */
  date: string;
  yesterday: {
    inbound: InboundLine[];
    outbound: OutboundLine[];
    transfer: TransferLine[];
    expense: ExpenseSummary;
  };
  profit: {
    salesTotal: number; // 출고 총 판매금액
    purchaseTotal: number; // 입고 총 수매가
    expenseTotal: number; // 지출 총액
    estimated: number; // 추정 손익 = sales - purchase - expense
  };
  pending: {
    yesterdayByType: PendingByType;
    yesterdayTotal: number;
    olderByType: PendingByType;
    olderTotal: number;
    staleCount: number; // 24시간 이상 미처리 (older 중 createdTime 기준)
  };
  threshold: number;
  thresholdExceeded: boolean;
}

const TYPE_LABELS: Record<keyof PendingByType, string> = {
  INBOUND: "입고",
  OUTBOUND: "출고",
  EXPENSE: "지출",
  TRANSFER: "이동",
};

// ──────────────────────────────────────────────
// 유틸
// ──────────────────────────────────────────────

function num(v: unknown): number {
  if (Array.isArray(v)) v = v[0];
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string {
  if (Array.isArray(v)) v = v[0];
  return String(v ?? "").trim();
}

/** YYYY-MM-DD를 어제 날짜로 (Asia/Seoul 기준) */
function yesterdayKstISO(): string {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kstNow.setUTCDate(kstNow.getUTCDate() - 1);
  const y = kstNow.getUTCFullYear();
  const m = String(kstNow.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kstNow.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Airtable 날짜 필드의 다양한 표현을 YYYY-MM-DD로 정규화 */
function dateOnly(raw: unknown): string {
  const s = str(raw);
  if (!s) return "";
  // ISO datetime → 날짜 부분만
  if (s.includes("T")) return s.slice(0, 10);
  return s.slice(0, 10);
}

function emptyByType(): PendingByType {
  return { INBOUND: 0, OUTBOUND: 0, EXPENSE: 0, TRANSFER: 0 };
}

// ──────────────────────────────────────────────
// LOT 잔여수량 일괄 조회
// ──────────────────────────────────────────────

async function fetchLotRemainingMap(
  lotRecordIds: string[],
): Promise<Record<string, number>> {
  const map: Record<string, number> = {};
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!apiKey || !baseId || lotRecordIds.length === 0) return map;

  const ids = [...new Set(lotRecordIds.filter((id) => /^rec/.test(id)))];
  if (ids.length === 0) return map;

  // 40개씩 배치 (formula 길이 제한 고려)
  for (let i = 0; i < ids.length; i += 40) {
    const batch = ids.slice(i, i + 40);
    const formula = `OR(${batch.map((id) => `RECORD_ID()="${id}"`).join(",")})`;
    const params = new URLSearchParams({ filterByFormula: formula });
    params.append("fields[]", "재고수량");
    try {
      const res = await fetch(
        `https://api.airtable.com/v0/${baseId}/LOT별%20재고?${params}`,
        { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store" },
      );
      if (!res.ok) continue;
      const data = (await res.json()) as {
        records?: { id: string; fields?: Record<string, unknown> }[];
      };
      for (const rec of data.records ?? []) {
        map[rec.id] = num(rec.fields?.["재고수량"]);
      }
    } catch {
      /* 네트워크 실패 시 빈 map 유지 — 잔여수량은 0으로 표시됨 */
    }
  }
  return map;
}

// ──────────────────────────────────────────────
// 보고서 생성
// ──────────────────────────────────────────────

export async function buildDailyReport(threshold: number): Promise<DailyReport> {
  const yesterday = yesterdayKstISO();
  const allItems = await getMyRequests();

  // ── 1. 어제 정산 (어제 일자 + 승인 완료) ──
  const yInbound: InboundLine[] = [];
  const yOutbound: OutboundLine[] = [];
  const yTransfer: TransferLine[] = [];
  let expenseCount = 0;
  let expenseTotal = 0;
  let purchaseTotal = 0;
  let salesTotal = 0;

  // 출고 잔여수량 join을 위한 LOT id 수집
  const outboundLotIds: string[] = [];
  const yesterdayOutboundsRaw: RequestItem[] = [];

  for (const item of allItems) {
    if (item.status !== "승인 완료") continue;

    if (item.type === "INBOUND") {
      const itemDate = dateOnly(item.raw["입고일"] ?? item.raw["입고일자"]);
      if (itemDate !== yesterday) continue;
      const qty = num(item.raw["입고수량"] ?? item.raw["입고수량(BOX)"]);
      const purchasePrice = num(item.raw["수매가"]);
      yInbound.push({
        productName: item.title || str(item.raw["품목명"]) || "-",
        spec: item.spec || str(item.raw["규격"]),
        misu: item.misu || str(item.raw["미수"]),
        qty,
        purchasePrice,
      });
      purchaseTotal += qty * purchasePrice;
      continue;
    }

    if (item.type === "OUTBOUND") {
      const itemDate = dateOnly(item.raw["출고일"]);
      if (itemDate !== yesterday) continue;
      const lotRecId = str(item.raw["LOT재고레코드ID"]);
      if (lotRecId) outboundLotIds.push(lotRecId);
      yesterdayOutboundsRaw.push(item);

      // 판매금액(총액)이 있으면 손익 합산에 사용, 없으면 판매가×수량 fallback
      const saleAmount = num(item.raw["판매금액"]);
      const salePrice = num(item.raw["판매가"]);
      const qty = num(item.raw["출고수량"]);
      salesTotal += saleAmount > 0 ? saleAmount : salePrice * qty;
      continue;
    }

    if (item.type === "TRANSFER") {
      const itemDate = dateOnly(item.raw["이동일"]);
      if (itemDate !== yesterday) continue;
      yTransfer.push({
        productName: item.title || str(item.raw["품목명"]) || "-",
        spec: item.spec || str(item.raw["규격"]),
        qty: num(item.raw["이동수량"] ?? item.raw["입고수량"]),
      });
      continue;
    }

    if (item.type === "EXPENSE") {
      const itemDate = dateOnly(item.raw["지출일"]);
      if (itemDate !== yesterday) continue;
      const amount = num(item.raw["금액"]);
      expenseCount++;
      expenseTotal += amount;
    }
  }

  // 출고 잔여수량 일괄 조회 후 매핑
  const lotRemainMap = await fetchLotRemainingMap(outboundLotIds);
  for (const item of yesterdayOutboundsRaw) {
    const lotRecId = str(item.raw["LOT재고레코드ID"]);
    yOutbound.push({
      buyer: str(item.raw["판매처"]) || "-",
      productName: item.title || "-",
      spec: item.spec || str(item.raw["규격"]),
      misu: item.misu || str(item.raw["미수"]),
      qty: num(item.raw["출고수량"]),
      remaining: lotRecId ? (lotRemainMap[lotRecId] ?? 0) : 0,
      salePrice: num(item.raw["판매가"]),
    });
  }

  // ── 2. 결재 대기 분리 (어제 일자 vs 그 외) ──
  const yesterdayBy: PendingByType = emptyByType();
  const olderBy: PendingByType = emptyByType();
  const now = Date.now();
  let staleCount = 0;

  for (const item of allItems) {
    if (item.status !== "승인 대기" && item.status !== "최종 승인 대기") continue;

    let dateField: string;
    switch (item.type) {
      case "INBOUND":
        dateField = dateOnly(item.raw["입고일"] ?? item.raw["입고일자"]);
        break;
      case "OUTBOUND":
        dateField = dateOnly(item.raw["출고일"]);
        break;
      case "TRANSFER":
        dateField = dateOnly(item.raw["이동일"]);
        break;
      case "EXPENSE":
        dateField = dateOnly(item.raw["지출일"] ?? item.raw["작성일"]);
        break;
      default:
        dateField = "";
    }

    if (dateField === yesterday) {
      yesterdayBy[item.type]++;
    } else {
      olderBy[item.type]++;
    }

    // 24시간 이상 stale 카운트 (createdTime 기준)
    if (item.createdTime) {
      const created = new Date(item.createdTime).getTime();
      if (Number.isFinite(created) && now - created >= STALE_MS) {
        staleCount++;
      }
    }
  }

  const yesterdayTotal = Object.values(yesterdayBy).reduce((a, b) => a + b, 0);
  const olderTotal = Object.values(olderBy).reduce((a, b) => a + b, 0);
  const totalPending = yesterdayTotal + olderTotal;

  return {
    date: yesterday,
    yesterday: {
      inbound: yInbound,
      outbound: yOutbound,
      transfer: yTransfer,
      expense: { count: expenseCount, totalAmount: expenseTotal },
    },
    profit: {
      salesTotal,
      purchaseTotal,
      expenseTotal,
      estimated: salesTotal - purchaseTotal - expenseTotal,
    },
    pending: {
      yesterdayByType: yesterdayBy,
      yesterdayTotal,
      olderByType: olderBy,
      olderTotal,
      staleCount,
    },
    threshold,
    thresholdExceeded: totalPending >= threshold,
  };
}

// ──────────────────────────────────────────────
// 메일 제목 / HTML
// ──────────────────────────────────────────────

export function buildReportSubject(report: DailyReport): string {
  const totalPending =
    report.pending.yesterdayTotal + report.pending.olderTotal;
  return report.thresholdExceeded
    ? `[SEAERP] 일일 정산 ${report.date} — 결재 대기 ${totalPending}건 (임계값 ${report.threshold} 초과)`
    : `[SEAERP] 일일 정산 ${report.date} — 결재 대기 ${totalPending}건`;
}

function won(n: number): string {
  return `₩${Math.round(n).toLocaleString("ko-KR")}`;
}

function signedWon(n: number): string {
  const sign = n >= 0 ? "+" : "−";
  return `${sign}₩${Math.abs(Math.round(n)).toLocaleString("ko-KR")}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInboundList(items: InboundLine[]): string {
  if (items.length === 0) return `<p class="empty">없음</p>`;
  const rows = items
    .map((it, idx) => {
      const cells = [
        escapeHtml(it.productName),
        it.spec ? escapeHtml(it.spec) : "-",
        it.misu ? escapeHtml(it.misu) : "-",
        `${it.qty.toLocaleString("ko-KR")}박스`,
        won(it.purchasePrice),
      ];
      return `<tr><td class="num">${idx + 1}</td>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
    })
    .join("");
  return `<table class="line-table"><thead><tr><th>#</th><th>품목명</th><th>규격</th><th>미수</th><th>박스</th><th>수매가/박스</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderOutboundList(items: OutboundLine[]): string {
  if (items.length === 0) return `<p class="empty">없음</p>`;
  const rows = items
    .map((it, idx) => {
      const cells = [
        escapeHtml(it.buyer),
        escapeHtml(it.productName),
        it.spec ? escapeHtml(it.spec) : "-",
        it.misu ? escapeHtml(it.misu) : "-",
        `${it.qty.toLocaleString("ko-KR")}박스`,
        `${it.remaining.toLocaleString("ko-KR")}박스`,
        won(it.salePrice),
      ];
      return `<tr><td class="num">${idx + 1}</td>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
    })
    .join("");
  return `<table class="line-table"><thead><tr><th>#</th><th>판매처</th><th>품목명</th><th>규격</th><th>미수</th><th>박스</th><th>잔여</th><th>판매가/박스</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderTransferList(items: TransferLine[]): string {
  if (items.length === 0) return `<p class="empty">없음</p>`;
  const rows = items
    .map((it, idx) => {
      const cells = [
        escapeHtml(it.productName),
        it.spec ? escapeHtml(it.spec) : "-",
        `${it.qty.toLocaleString("ko-KR")}박스`,
      ];
      return `<tr><td class="num">${idx + 1}</td>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
    })
    .join("");
  return `<table class="line-table"><thead><tr><th>#</th><th>품목명</th><th>규격</th><th>박스</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderPendingTable(by: PendingByType, total: number): string {
  const rows = (Object.keys(TYPE_LABELS) as (keyof PendingByType)[])
    .map(
      (k) =>
        `<tr><td>${TYPE_LABELS[k]}</td><td class="num">${by[k]}건</td></tr>`,
    )
    .join("");
  return `<table class="pending-table"><tbody>${rows}<tr class="sum"><td>합계</td><td class="num">${total}건</td></tr></tbody></table>`;
}

export function buildReportHtml(
  report: DailyReport,
  dashboardUrl?: string,
): string {
  const inSection = renderInboundList(report.yesterday.inbound);
  const outSection = renderOutboundList(report.yesterday.outbound);
  const trSection = renderTransferList(report.yesterday.transfer);

  const expense = report.yesterday.expense;
  const expSection =
    expense.count === 0
      ? `<p class="empty">없음</p>`
      : `<p class="expense-summary"><strong>${expense.count}건</strong> · 총 ${won(expense.totalAmount)}</p>`;

  const profit = report.profit;
  const profitClass = profit.estimated >= 0 ? "profit-positive" : "profit-negative";

  const dashboardLink = dashboardUrl
    ? `<p class="cta-wrap no-print"><a class="cta" href="${dashboardUrl}">결재 수신함으로 이동</a></p>`
    : "";

  const thresholdBanner = report.thresholdExceeded
    ? `<div class="alert">⚠ 임계값(${report.threshold}건) 초과 — 즉시 처리 필요</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><title>SEAERP 일일 정산 ${report.date}</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif; color: #191F28; background: #F2F4F6; font-size: 13px; line-height: 1.5; }
  .container { max-width: 760px; margin: 0 auto; background: #fff; padding: 28px 32px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
  h1 { font-size: 20px; margin: 0 0 4px; font-weight: 700; }
  .subtitle { color: #6b7280; font-size: 13px; margin: 0 0 20px; }
  h2 { font-size: 15px; margin: 24px 0 10px; font-weight: 700; padding-bottom: 6px; border-bottom: 2px solid #191F28; page-break-after: avoid; }
  h3 { font-size: 13px; margin: 14px 0 6px; font-weight: 700; color: #374151; page-break-after: avoid; }
  .empty { color: #9ca3af; font-size: 13px; margin: 4px 0 8px; padding-left: 4px; }
  .alert { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 12px 16px; border-radius: 8px; margin: 0 0 16px; font-weight: 700; font-size: 13px; }

  table { width: 100%; border-collapse: collapse; margin: 4px 0 8px; page-break-inside: avoid; }
  .line-table th, .line-table td { padding: 7px 10px; border-bottom: 1px solid #f3f4f6; text-align: left; font-size: 12px; }
  .line-table th { background: #f9fafb; font-weight: 700; color: #374151; }
  .line-table td.num { color: #6b7280; width: 24px; }
  .pending-table { max-width: 280px; }
  .pending-table td { padding: 6px 10px; border-bottom: 1px solid #f3f4f6; font-size: 13px; }
  .pending-table td.num { text-align: right; font-weight: 700; }
  .pending-table tr.sum td { border-top: 1px solid #d1d5db; border-bottom: none; font-weight: 700; padding-top: 8px; }

  .expense-summary { font-size: 14px; padding: 8px 12px; background: #f9fafb; border-radius: 8px; margin: 4px 0; }

  .profit { background: #f9fafb; border-radius: 10px; padding: 14px 18px; margin: 14px 0; page-break-inside: avoid; }
  .profit-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
  .profit-row.total { border-top: 1px solid #d1d5db; margin-top: 6px; padding-top: 10px; font-weight: 700; font-size: 15px; }
  .profit-positive { color: #00C471; }
  .profit-negative { color: #ef4444; }

  .pending-section { display: flex; gap: 24px; flex-wrap: wrap; align-items: flex-start; }
  .pending-block { flex: 1; min-width: 240px; }
  .pending-block.older { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 10px 14px; }
  .pending-block.yesterday { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 10px 14px; }

  .stale { color: #b45309; font-weight: 700; font-size: 13px; margin-top: 8px; }

  .cta-wrap { margin: 22px 0 4px; text-align: center; }
  .cta { display: inline-block; background: #191F28; color: #fff; padding: 11px 22px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 13px; }

  .footer { font-size: 11px; color: #9ca3af; margin: 24px 0 0; padding-top: 14px; border-top: 1px solid #e5e7eb; text-align: center; }

  /* A4 인쇄 친화 */
  @media print {
    body { background: #fff; padding: 0; font-size: 11px; }
    .container { box-shadow: none; padding: 0; max-width: 100%; }
    .no-print { display: none !important; }
    h2 { page-break-after: avoid; }
    table, .profit { page-break-inside: avoid; }
  }
</style>
</head>
<body>
  <div class="container">
    <h1>SEAERP 일일 정산</h1>
    <p class="subtitle">${report.date} (어제) — ${seoulDateString()} 발송</p>

    ${thresholdBanner}

    <h2>📦 어제 정산 (승인된 건만)</h2>

    <h3>입고 ${report.yesterday.inbound.length}건</h3>
    ${inSection}

    <h3>출고 ${report.yesterday.outbound.length}건</h3>
    ${outSection}

    <h3>이동 ${report.yesterday.transfer.length}건</h3>
    ${trSection}

    <h3>지출 ${expense.count}건</h3>
    ${expSection}

    <h2>💰 어제 추정 손익</h2>
    <div class="profit">
      <div class="profit-row"><span>출고 판매가 합</span><span>${signedWon(profit.salesTotal)}</span></div>
      <div class="profit-row"><span>입고 수매가 합</span><span>${signedWon(-profit.purchaseTotal)}</span></div>
      <div class="profit-row"><span>지출 합</span><span>${signedWon(-profit.expenseTotal)}</span></div>
      <div class="profit-row total"><span>대략 손익</span><span class="${profitClass}">${signedWon(profit.estimated)}</span></div>
    </div>

    <h2>📌 현재 결재 대기</h2>
    <div class="pending-section">
      <div class="pending-block yesterday">
        <h3 style="margin-top:0;">어제(${report.date}) 신청 미결재 — ${report.pending.yesterdayTotal}건</h3>
        ${renderPendingTable(report.pending.yesterdayByType, report.pending.yesterdayTotal)}
      </div>
      <div class="pending-block older">
        <h3 style="margin-top:0;">그 외 누적 미결재 — ${report.pending.olderTotal}건</h3>
        ${renderPendingTable(report.pending.olderByType, report.pending.olderTotal)}
      </div>
    </div>
    ${report.pending.staleCount > 0 ? `<p class="stale">⏰ 24시간 이상 미처리: ${report.pending.staleCount}건</p>` : ""}

    ${dashboardLink}

    <p class="footer">이 메일은 매일 아침 9시(KST) 자동 발송됩니다.<br/>※ 손익은 출고 판매가 합 − 입고 수매가 합 − 지출 합 으로 산출한 추정치입니다.</p>
  </div>
</body>
</html>`;
}
