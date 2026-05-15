import { NextResponse } from "next/server";
import { buildReportHtml, type DailyReport } from "@/lib/daily-report";

/**
 * 일일 보고서 디자인 프리뷰 (개발 전용)
 *
 * GET /api/preview/daily-report
 *
 * 실제 데이터 없이도 메일 디자인을 확인할 수 있도록 가짜 데이터로 buildReportHtml()을
 * 호출해 HTML을 반환합니다. lib/daily-report.ts 의 디자인을 그대로 사용하므로
 * 향후 디자인 변경이 자동 반영됩니다.
 *
 * production 환경에서는 항상 404.
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  const mock: DailyReport = {
    date: "2026-05-05",
    yesterday: {
      inbound: [
        { productName: "고등어", spec: "11kg", misu: "26", qty: 8, purchasePrice: 50000 },
        { productName: "갈치", spec: "12kg", misu: "24", qty: 5, purchasePrice: 48000 },
        { productName: "연어", spec: "10kg", misu: "", qty: 3, purchasePrice: 60000 },
        { productName: "오징어", spec: "8kg", misu: "30", qty: 12, purchasePrice: 32000 },
        { productName: "조기", spec: "9kg", misu: "20", qty: 6, purchasePrice: 45000 },
      ],
      outbound: [
        { buyer: "○○수산", productName: "고등어", spec: "11kg", misu: "26", qty: 2, remaining: 6, salePrice: 55000 },
        { buyer: "△△마트", productName: "갈치", spec: "12kg", misu: "24", qty: 4, remaining: 1, salePrice: 52000 },
        { buyer: "□□시장", productName: "연어", spec: "10kg", misu: "", qty: 1, remaining: 2, salePrice: 68000 },
        { buyer: "○○수산", productName: "오징어", spec: "8kg", misu: "30", qty: 5, remaining: 7, salePrice: 36000 },
        { buyer: "××유통", productName: "고등어", spec: "11kg", misu: "26", qty: 3, remaining: 3, salePrice: 55000 },
        { buyer: "△△마트", productName: "조기", spec: "9kg", misu: "20", qty: 4, remaining: 2, salePrice: 50000 },
        { buyer: "○○수산", productName: "갈치", spec: "12kg", misu: "24", qty: 1, remaining: 0, salePrice: 52000 },
      ],
      transfer: [
        { productName: "고등어", spec: "11kg", qty: 5 },
      ],
      expense: { count: 3, totalAmount: 320000 },
    },
    profit: {
      salesTotal: 1346000,
      purchaseTotal: 1199000,
      expenseTotal: 320000,
      estimated: 1346000 - 1199000 - 320000,
    },
    pending: {
      yesterdayByType: { INBOUND: 2, OUTBOUND: 1, EXPENSE: 0, TRANSFER: 0 },
      yesterdayTotal: 3,
      olderByType: { INBOUND: 1, OUTBOUND: 2, EXPENSE: 1, TRANSFER: 0 },
      olderTotal: 4,
      staleCount: 2,
    },
    health: {
      negativeStockLots: 0,
      invalidRemainingInbound: 1,
      outboundCostNull: 0,
      lockedPins: 0,
      yesterdayThroughput: { requested: 7, processed: 5, pending: 2 },
    },
    threshold: 10,
    thresholdExceeded: false,
  };

  const html = buildReportHtml(mock, "http://localhost:3003/admin/dashboard");
  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
