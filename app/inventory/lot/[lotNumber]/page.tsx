import Link from "next/link";
import QRCode from "qrcode";
import PageHeader from "@/components/PageHeader";
import { fetchLotDetailByNumber, type LotDetail } from "@/lib/lot-detail";
import { getBaseUrl } from "@/lib/base-url";
import { logError } from "@/lib/logger";

export const dynamic = "force-dynamic";

async function buildQrDataUrl(lotNumber: string): Promise<string | null> {
  try {
    const url = `${getBaseUrl()}/inventory/lot/${encodeURIComponent(lotNumber)}`;
    return await QRCode.toDataURL(url, {
      errorCorrectionLevel: "M",
      width: 300,
      margin: 1,
    });
  } catch (e) {
    logError("[lot-detail page] QR 생성 실패:", e);
    return null;
  }
}

function NotFoundView({ lotNumber }: { lotNumber: string }) {
  return (
    <main
      className="min-h-screen bg-[#F2F4F6]"
      style={{ fontFamily: "'Spoqa Han Sans Neo', sans-serif" }}
    >
      <PageHeader title="LOT 상세" />
      <div className="px-5 pt-6 space-y-3">
        <div className="bg-white rounded-[24px] p-6 shadow-[0_8px_24px_rgba(149,157,165,0.08)] text-center space-y-3">
          <p className="text-[15px] font-bold text-gray-900">
            LOT을 찾을 수 없습니다
          </p>
          <p className="font-mono text-[13px] text-gray-500 break-all">
            {lotNumber || "-"}
          </p>
          <p className="text-[12px] text-gray-400">
            QR이 손상되었거나 삭제된 LOT일 수 있습니다.
          </p>
        </div>
        <Link
          href="/inventory/status"
          className="block w-full py-4 rounded-2xl bg-[#3182F6] text-white text-center text-[15px] font-black shadow-[0_4px_16px_rgba(49,130,246,0.3)] active:scale-[0.98] transition-all"
        >
          재고 조회로 가기
        </Link>
        <Link
          href="/"
          className="block w-full py-3 rounded-2xl bg-white text-gray-700 text-center text-[14px] font-bold border border-gray-200 active:bg-gray-50 transition-all"
        >
          메인으로
        </Link>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5 border-b border-gray-100 last:border-b-0">
      <span className="text-[13px] font-bold text-gray-500 shrink-0">
        {label}
      </span>
      <span className="text-[14px] font-bold text-gray-900 text-right break-words">
        {value || "-"}
      </span>
    </div>
  );
}

function formatBoxes(qty: number): string {
  if (!Number.isFinite(qty) || qty <= 0) return "-";
  return `${qty.toLocaleString("ko-KR")} BOX`;
}

function formatSpecMisu(spec: string, detailSpec: string): string {
  const left = spec ? `${spec}kg` : "";
  const right = detailSpec ? `${detailSpec}미` : "";
  if (left && right) return `${left} · ${right}`;
  return left || right || "";
}

function formatInboundLine(date: string, days: number): string {
  if (!date) return "-";
  if (days <= 0) return `${date} (오늘)`;
  return `${date} (${days}일째)`;
}

function DetailView({
  detail,
  qrDataUrl,
}: {
  detail: LotDetail;
  qrDataUrl: string | null;
}) {
  return (
    <main
      className="min-h-screen bg-[#F2F4F6] pb-10"
      style={{ fontFamily: "'Spoqa Han Sans Neo', sans-serif" }}
    >
      <PageHeader title="LOT 상세" />

      <div className="px-5 pt-4 space-y-3">
        {/* QR + LOT 번호 카드 */}
        <div className="bg-white rounded-[24px] p-5 shadow-[0_8px_24px_rgba(149,157,165,0.08)] flex flex-col items-center gap-3">
          {qrDataUrl ? (
            // QR data URL이라 next/image 최적화 이점이 없어 native img 유지
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrDataUrl}
              alt={`LOT ${detail.lotNumber} QR 코드`}
              className="w-[200px] h-[200px]"
            />
          ) : (
            <div className="w-[200px] h-[200px] flex items-center justify-center bg-gray-50 rounded-2xl text-[12px] text-gray-400">
              QR 생성 실패
            </div>
          )}
          <p className="font-mono text-[15px] font-black text-[#3182F6] tracking-tight break-all text-center">
            {detail.lotNumber}
          </p>
        </div>

        {/* 재고 정보 카드 */}
        <div className="bg-white rounded-[24px] px-5 py-2 shadow-[0_8px_24px_rgba(149,157,165,0.08)]">
          <Row label="품목명" value={detail.productName} />
          <Row
            label="규격 · 미수"
            value={formatSpecMisu(detail.spec, detail.detailSpec)}
          />
          <Row label="보관처" value={detail.storage} />
          <Row
            label="재고 / 입고"
            value={
              detail.stockQty || detail.initialQty
                ? `${formatBoxes(detail.stockQty)} / ${formatBoxes(detail.initialQty)}`
                : "-"
            }
          />
          <Row
            label="입고일"
            value={formatInboundLine(detail.inboundDate, detail.daysSinceInbound)}
          />
          <Row label="매입처" value={detail.supplier} />
          <Row label="매입자" value={detail.purchaser} />
          <Row label="선박명" value={detail.shipName} />
        </div>

        <Link
          href="/inventory/status"
          className="block w-full py-4 rounded-2xl bg-[#3182F6] text-white text-center text-[15px] font-black shadow-[0_4px_16px_rgba(49,130,246,0.3)] active:scale-[0.98] transition-all"
        >
          재고 조회로 가기
        </Link>
      </div>
    </main>
  );
}

export default async function LotDetailPage({
  params,
}: {
  params: Promise<{ lotNumber: string }>;
}) {
  const { lotNumber: rawParam } = await params;
  const lotNumber = decodeURIComponent(rawParam ?? "").trim();

  if (!lotNumber) {
    return <NotFoundView lotNumber="" />;
  }

  const detail = await fetchLotDetailByNumber(lotNumber);
  if (!detail) {
    return <NotFoundView lotNumber={lotNumber} />;
  }

  const qrDataUrl = await buildQrDataUrl(detail.lotNumber);
  return <DetailView detail={detail} qrDataUrl={qrDataUrl} />;
}
