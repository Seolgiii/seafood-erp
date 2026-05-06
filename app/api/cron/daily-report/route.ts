import { NextResponse } from "next/server";
import {
  buildDailyReport,
  buildReportHtml,
  buildReportSubject,
} from "@/lib/daily-report";
import { sendEmail } from "@/lib/resend";
import { log, logError, logWarn } from "@/lib/logger";

/**
 * 일일 결재 현황 보고서 cron
 *
 * Vercel Cron이 매일 09:00 KST(=00:00 UTC)에 GET 요청을 보냅니다.
 * vercel.json 의 crons 설정과 짝을 이룹니다.
 *
 * 인증: Vercel cron이 자동으로 `Authorization: Bearer <CRON_SECRET>` 헤더를
 * 동봉합니다. CRON_SECRET이 설정되지 않으면 인증 없이 동작 (개발 편의용).
 *
 * 환경변수:
 *   - CRON_SECRET (선택, 권장): 운영에서 cron 인증
 *   - ALERT_EMAIL_TO (필수): 수신자 이메일 (콤마로 구분된 다중 주소 가능)
 *   - RESEND_API_KEY (필수): Resend API 키
 *   - ALERT_THRESHOLD (선택, 기본 10): 강조 표시 임계값
 *   - ALERT_EMAIL_FROM (선택): 발송자, 기본 "SEAERP <onboarding@resend.dev>"
 *   - NEXT_PUBLIC_BASE_URL (선택): 보고서 내 대시보드 링크 base
 */
export async function GET(request: Request) {
  // ── Vercel cron 인증 ──
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret) {
    const auth = request.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${cronSecret}`) {
      logWarn("[cron/daily-report] 인증 실패");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // ── 수신 주소 검증 ──
  const toRaw = process.env.ALERT_EMAIL_TO?.trim() ?? "";
  if (!toRaw) {
    logError("[cron/daily-report] ALERT_EMAIL_TO 미설정");
    return NextResponse.json(
      { ok: false, error: "ALERT_EMAIL_TO 미설정" },
      { status: 500 },
    );
  }
  const to = toRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // ── 임계값 ──
  const thresholdRaw = Number(process.env.ALERT_THRESHOLD ?? 10);
  const threshold =
    Number.isFinite(thresholdRaw) && thresholdRaw > 0 ? thresholdRaw : 10;

  try {
    const report = await buildDailyReport(threshold);
    log("[cron/daily-report] 보고서 생성:", {
      date: report.date,
      totalPending: report.totalPending,
      thresholdExceeded: report.thresholdExceeded,
      staleCount: report.staleCount,
    });

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL?.trim();
    const dashboardUrl = baseUrl ? `${baseUrl}/admin/dashboard` : undefined;
    const html = buildReportHtml(report, dashboardUrl);
    const subject = buildReportSubject(report);

    const result = await sendEmail({ to, subject, html });
    if (!result.ok) {
      logError("[cron/daily-report] 이메일 발송 실패:", result.error);
      return NextResponse.json(
        { ok: false, error: result.error, report },
        { status: 500 },
      );
    }

    log("[cron/daily-report] 이메일 발송 완료:", result.id);
    return NextResponse.json({
      ok: true,
      emailId: result.id,
      report: {
        date: report.date,
        totalPending: report.totalPending,
        thresholdExceeded: report.thresholdExceeded,
        staleCount: report.staleCount,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    logError("[cron/daily-report] 예외:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
