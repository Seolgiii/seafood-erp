"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ArrowDownOnSquareIcon,
  ArrowUpOnSquareIcon,
  ArrowsRightLeftIcon,
  CubeIcon,
  BanknotesIcon,
  ClipboardDocumentListIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/solid";
import { QrCodeIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { readSession } from "@/lib/session";
import { getDashboardStats, type DashboardStats } from "@/app/actions/dashboard";
import { toast } from "@/lib/toast";

const BarcodeScanner = dynamic(
  () => import("@/app/components/BarcodeScanner"),
  { ssr: false, loading: () => null },
);

export default function WorkerDashboard() {
  const router = useRouter();
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);
  const [role, setRole] = useState<string | undefined>(undefined);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [hasCamera, setHasCamera] = useState<boolean | null>(null);

  useEffect(() => {
    const session = readSession();
    if (!session) return;
    setRole(session.role);

    const isAdminRole = session.role === "ADMIN" || session.role === "MASTER";
    if (!isAdminRole) return;

    getDashboardStats(undefined)
      .then(setStats)
      .catch(() => {});
  }, []);

  // 카메라 지원 여부 감지 (모바일: true, PC: false)
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
      setHasCamera(false);
      return;
    }
    navigator.mediaDevices
      .enumerateDevices()
      .then((devices) => setHasCamera(devices.some((d) => d.kind === "videoinput")))
      .catch(() => setHasCamera(false));
  }, []);

  const handleQrClick = () => {
    if (hasCamera === false) {
      toast("QR 스캔은 모바일에서 사용할 수 있습니다.", "info");
      return;
    }
    setScannerOpen(true);
  };

  const handleScanResult = (raw: string) => {
    const code = raw.trim();
    let target = "";
    try {
      const url = new URL(code);
      const match = url.pathname.match(/^\/inventory\/lot\/(.+)$/);
      if (match) {
        target = `/inventory/lot/${match[1]}`;
      } else {
        // 옛 PDF QR(`/inventory/outbound?lot=...`) 호환
        const lotParam = url.searchParams.get("lot");
        if (lotParam) target = `/inventory/lot/${encodeURIComponent(lotParam)}`;
      }
    } catch {
      // URL 형식이 아닌 경우: LOT 번호 패턴이면 직접 사용
      if (/^[0-9A-Za-z-]+$/.test(code) && code.length >= 6) {
        target = `/inventory/lot/${encodeURIComponent(code)}`;
      }
    }

    setScannerOpen(false);
    if (target) {
      router.push(target);
    } else {
      toast("인식할 수 없는 QR입니다.", "error");
    }
  };

  const heroItems = [
    { id: "inbound", title: "물품 입고", desc: "새로운 원물 등록", Icon: ArrowDownOnSquareIcon, iconBg: "#3182F6", path: "/inventory/record" },
    { id: "outbound", title: "물품 출고", desc: "판매처 출고", Icon: ArrowUpOnSquareIcon, iconBg: "#FF3B30", path: "/inventory/outbound" },
  ];

  const allSecondaryItems = [
    { id: "transfer", title: "재고 이동", desc: "보관처 이동", Icon: ArrowsRightLeftIcon, iconBg: "#FF8C00", path: "/inventory/transfer" },
    { id: "status", title: "재고 조회", desc: "조회 · 묶음 출고/이동", Icon: CubeIcon, iconBg: "#8B95A1", path: "/inventory/status" },
    { id: "expense-new", title: "지출 신청", desc: "자재/경비 결의서", Icon: BanknotesIcon, iconBg: "#00D082", path: "/expense/new" },
    { id: "my-requests", title: "신청 내역", desc: "내 신청 현황 조회", Icon: ClipboardDocumentListIcon, iconBg: "#5061FF", path: "/my-requests" },
    { id: "admin-system", title: "관리자 시스템", desc: "결재 및 통합 관리", Icon: ShieldCheckIcon, iconBg: "#191F28", path: "/admin/dashboard", adminOnly: true },
  ];

  const secondaryItems = allSecondaryItems.filter(
    (item) => !item.adminOnly || role === "ADMIN" || role === "MASTER"
  );

  return (
    // font-sans 클래스 대신 명시적으로 style 속성이나 globals.css의 설정을 따릅니다.
    <div className="min-h-screen bg-[#F2F4F6] flex flex-col pb-10" style={{ fontFamily: "'Spoqa Han Sans Neo', 'sans-serif'" }}>
      
      {/* 상단 헤더 */}
      <header className="px-5 pt-5 pb-1 flex items-center justify-between">
        <h1 className="text-[20px] font-black text-[#3182F6] tracking-tight">SEAERP</h1>
        <button
          type="button"
          onClick={handleQrClick}
          aria-label="QR 스캔"
          className="w-10 h-10 rounded-xl bg-white border border-gray-100 flex items-center justify-center shadow-[0_4px_12px_rgba(149,157,165,0.12)] active:scale-95 transition-transform"
        >
          <QrCodeIcon className="w-5 h-5 text-[#3182F6]" />
        </button>
      </header>

      {/* 메인 콘텐츠 영역 */}
      <main className="flex-1 p-5 flex flex-col gap-4">
        {/* KPI 스트립 — 결재 대기 (관리자/마스터 전용) */}
        {(role === "ADMIN" || role === "MASTER") && (
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "입·출고 대기", value: stats?.pendingLogistics, tab: "LOGISTICS" },
              { label: "지출 대기", value: stats?.pendingExpense, tab: "EXPENSE" },
            ].map((kpi) => {
              const count = kpi.value ?? 0;
              const highlight = count > 0;
              return (
                <button
                  key={kpi.label}
                  type="button"
                  onClick={() => router.push(`/admin/dashboard?tab=${kpi.tab}`)}
                  className="bg-white rounded-2xl p-3 shadow-[0_4px_12px_rgba(149,157,165,0.06)] text-center active:scale-[0.97] transition-transform touch-manipulation"
                >
                  <div className="text-[12px] font-bold text-gray-400 tracking-tight whitespace-nowrap">
                    {kpi.label}
                  </div>
                  <div
                    className={`text-[24px] font-black leading-tight mt-1 ${
                      highlight ? "text-[#FF3B30]" : "text-gray-900"
                    }`}
                  >
                    {stats === null ? "-" : `${count}건`}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Hero 카드 — 입고·출고 (대형, 중앙 정렬) */}
        <div className="grid grid-cols-2 gap-4">
          {heroItems.map((item) => (
            <button
              key={item.id}
              onClick={() => router.push(item.path)}
              className="bg-white p-5 rounded-[24px] flex flex-col items-center justify-center gap-2 shadow-[0_8px_24px_rgba(149,157,165,0.08)] active:scale-[0.96] transition-transform text-center border border-transparent active:border-blue-100 aspect-[4/3]"
            >
              <div
                className="w-14 h-14 rounded-[20px] flex items-center justify-center shadow-inner"
                style={{ backgroundColor: item.iconBg }}
              >
                <item.Icon className="w-8 h-8 text-white" />
              </div>
              <div>
                <h2 className="text-[18px] font-black text-gray-900 tracking-tight">{item.title}</h2>
                <p className="text-[13px] text-gray-400 font-medium mt-1 tracking-tight break-keep">{item.desc}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Secondary 카드 — 보조 메뉴 (compact 가로형) */}
        <div className="grid grid-cols-2 gap-3">
          {secondaryItems.map((item) => (
            <button
              key={item.id}
              onClick={() => router.push(item.path)}
              className="bg-white p-4 rounded-[20px] flex items-center gap-3 shadow-[0_4px_12px_rgba(149,157,165,0.06)] active:scale-[0.97] transition-transform text-left"
            >
              <div
                className="w-10 h-10 rounded-[14px] flex items-center justify-center shadow-inner shrink-0"
                style={{ backgroundColor: item.iconBg }}
              >
                <item.Icon className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h2 className="text-[14px] font-bold text-gray-900 tracking-tight truncate">{item.title}</h2>
                <p className="text-[11px] text-gray-400 font-medium tracking-tight truncate">{item.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </main>

      <footer className="mt-auto flex justify-center items-center gap-1.5 px-5 pb-8 pt-2">
        <div className={`w-2 h-2 rounded-full ${isOnline ? "bg-green-500" : "bg-red-500 animate-ping"}`} />
        <span className="text-[13px] font-bold text-gray-500 tracking-tight">
          {isOnline ? "클라우드 동기화됨" : "오프라인 모드"}
        </span>
      </footer>

      {scannerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/60"
          onClick={() => setScannerOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-white rounded-t-[32px] p-5"
            style={{ paddingBottom: "calc(32px + env(safe-area-inset-bottom))" }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[18px] font-black text-gray-900">QR 스캔</h2>
              <button
                type="button"
                onClick={() => setScannerOpen(false)}
                className="w-9 h-9 rounded-xl flex items-center justify-center active:bg-gray-100"
                aria-label="닫기"
              >
                <XMarkIcon className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <BarcodeScanner onDetected={handleScanResult} />
            <p className="text-center text-[12px] font-medium text-gray-400 mt-3">
              QR을 인식하면 LOT 상세로 이동합니다
            </p>
          </div>
        </div>
      )}
    </div>
  );
}