import "server-only";
import { getPendingApprovals } from "@/app/actions/admin/admin";
import { seoulDateString } from "@/lib/date";

/**
 * 일일 결재 현황 보고서 — type별 카운트, 24시간 이상 미처리 건, 임계값 초과 여부
 */

const STALE_MS = 24 * 60 * 60 * 1000;

export interface DailyReport {
  date: string;
  totalPending: number;
  byType: {
    INBOUND: number;
    OUTBOUND: number;
    EXPENSE: number;
    TRANSFER: number;
  };
  staleCount: number;
  threshold: number;
  thresholdExceeded: boolean;
}

const TYPE_LABELS: Record<keyof DailyReport["byType"], string> = {
  INBOUND: "물품 입고",
  OUTBOUND: "물품 출고",
  EXPENSE: "지출 신청",
  TRANSFER: "재고 이동",
};

export async function buildDailyReport(threshold: number): Promise<DailyReport> {
  const pending = await getPendingApprovals();

  const byType: DailyReport["byType"] = {
    INBOUND: 0,
    OUTBOUND: 0,
    EXPENSE: 0,
    TRANSFER: 0,
  };
  let staleCount = 0;
  const now = Date.now();

  for (const item of pending) {
    if (item.type in byType) {
      byType[item.type as keyof typeof byType]++;
    }
    if (item.createdTime) {
      const created = new Date(item.createdTime).getTime();
      if (Number.isFinite(created) && now - created >= STALE_MS) {
        staleCount++;
      }
    }
  }

  return {
    date: seoulDateString(),
    totalPending: pending.length,
    byType,
    staleCount,
    threshold,
    thresholdExceeded: pending.length >= threshold,
  };
}

export function buildReportSubject(report: DailyReport): string {
  return report.thresholdExceeded
    ? `[SEAERP] 결재 대기 ${report.totalPending}건 (임계값 ${report.threshold} 초과) — ${report.date}`
    : `[SEAERP] 일일 결재 현황 ${report.date} — 대기 ${report.totalPending}건`;
}

export function buildReportHtml(
  report: DailyReport,
  dashboardUrl?: string,
): string {
  const exceededBanner = report.thresholdExceeded
    ? `<div style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:14px 18px;border-radius:8px;margin:0 0 18px;font-weight:bold;font-size:14px;">
         ⚠️ 임계값(${report.threshold}건) 초과 — 즉시 처리 필요
       </div>`
    : "";

  const staleSection =
    report.staleCount > 0
      ? `<p style="background:#fffbeb;border:1px solid #fde68a;color:#92400e;padding:12px 16px;border-radius:8px;margin:16px 0 0;font-weight:bold;font-size:14px;">
           📌 24시간 이상 미처리: <strong>${report.staleCount}건</strong>
         </p>`
      : "";

  const dashboardLink = dashboardUrl
    ? `<p style="margin:24px 0 0;text-align:center;">
         <a href="${dashboardUrl}" style="display:inline-block;background:#191F28;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;">
           결재 수신함으로 이동
         </a>
       </p>`
    : "";

  const typeRows = (Object.keys(TYPE_LABELS) as (keyof DailyReport["byType"])[])
    .map(
      (k, i, arr) => `
        <tr>
          <td style="padding:10px 12px;${i < arr.length - 1 ? "border-bottom:1px solid #f3f4f6;" : ""}">${TYPE_LABELS[k]}</td>
          <td style="padding:10px 12px;text-align:right;font-weight:bold;${i < arr.length - 1 ? "border-bottom:1px solid #f3f4f6;" : ""}">${report.byType[k]}건</td>
        </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;color:#191F28;background:#F2F4F6;">
  <div style="max-width:600px;margin:0 auto;background:#fff;padding:28px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
    <h1 style="font-size:20px;margin:0 0 6px;font-weight:bold;">SEAERP 일일 결재 현황</h1>
    <p style="color:#6b7280;margin:0 0 20px;font-size:14px;">${report.date} 기준</p>

    ${exceededBanner}

    <div style="background:#f9fafb;padding:18px;border-radius:8px;margin:0 0 18px;text-align:center;">
      <p style="margin:0;font-size:13px;color:#6b7280;">총 승인 대기</p>
      <p style="margin:6px 0 0;font-size:32px;font-weight:bold;color:${report.thresholdExceeded ? "#991b1b" : "#191F28"};">${report.totalPending}건</p>
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="text-align:left;padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:bold;">유형</th>
          <th style="text-align:right;padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:bold;">건수</th>
        </tr>
      </thead>
      <tbody>${typeRows}</tbody>
    </table>

    ${staleSection}
    ${dashboardLink}

    <p style="font-size:12px;color:#9ca3af;margin:28px 0 0;border-top:1px solid #e5e7eb;padding-top:16px;text-align:center;">
      이 메일은 SEAERP 일일 자동 보고 cron이 발송했습니다.
    </p>
  </div>
</body>
</html>`;
}
