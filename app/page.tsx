"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownOnSquareIcon,
  ArrowUpOnSquareIcon,
  CubeIcon,
  BanknotesIcon,
  ClipboardDocumentListIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/solid";
import { clearSession, readSession } from "@/lib/session";
import { getDashboardStats, type DashboardStats } from "@/app/actions/dashboard";

export default function WorkerDashboard() {
  const router = useRouter();
  const [isOnline, setIsOnline] = useState(true);
  const [workerName, setWorkerName] = useState("");
  const [role, setRole] = useState<string | undefined>(undefined);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    const session = readSession();
    if (!session) return;
    setWorkerName(session.workerName);
    setRole(session.role);

    const isAdminRole = session.role === "ADMIN" || session.role === "MASTER";
    const workerId = isAdminRole ? undefined : session.workerId;
    getDashboardStats(workerId)
      .then(setStats)
      .catch((e) => console.error("[dashboard] stats fetch 오류", e));
  }, []);

  const handleLogout = () => {
    if (!window.confirm("정말 로그아웃 하시겠습니까?")) return;
    clearSession();
    router.replace("/login");
  };

  const heroItems = [
    { id: "inbound", title: "물품 입고", desc: "새로운 원물 등록", Icon: ArrowDownOnSquareIcon, iconBg: "#3182F6", path: "/inventory/record" },
    { id: "outbound", title: "물품 출고", desc: "바코드 즉시 출고", Icon: ArrowUpOnSquareIcon, iconBg: "#FF3B30", path: "/inventory/outbound" },
  ];

  const allSecondaryItems = [
    { id: "status", title: "재고 조회", desc: "실시간 현장 재고", Icon: CubeIcon, iconBg: "#8B95A1", path: "/inventory/status" },
    { id: "expense-new", title: "지출 신청", desc: "자재/경비 결의서", Icon: BanknotesIcon, iconBg: "#00D082", path: "/expense/new" },
    { id: "my-requests", title: "신청 내역", desc: "내 신청 현황 조회", Icon: ClipboardDocumentListIcon, iconBg: "#FF8C00", path: "/my-requests" },
    { id: "admin-system", title: "관리자 시스템", desc: "결재 및 통합 관리", Icon: ShieldCheckIcon, iconBg: "#191F28", path: "/admin/dashboard", adminOnly: true },
  ];

  const secondaryItems = allSecondaryItems.filter(
    (item) => !item.adminOnly || role === "ADMIN" || role === "MASTER"
  );

  return (
    // font-sans 클래스 대신 명시적으로 style 속성이나 globals.css의 설정을 따릅니다.
    <div className="min-h-screen bg-[#F2F4F6] flex flex-col pb-10" style={{ fontFamily: "'Spoqa Han Sans Neo', 'sans-serif'" }}>
      
      {/* 상단 헤더 */}
      <header className="bg-white px-5 py-4 flex justify-between items-center sticky top-0 z-20 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">
        <h1 className="text-[20px] font-black text-[#3182F6] tracking-tight">SEAERP</h1>
        <button
          onClick={handleLogout}
          className="bg-[#FF4545] text-white font-bold py-2 px-4 rounded-xl active:scale-95 transition-transform text-sm"
        >
          로그아웃
        </button>
      </header>

      {/* 메인 콘텐츠 영역 */}
      <main className="flex-1 p-5 flex flex-col gap-4">
        {/* 환영 메시지 */}
        <section className="py-0">
          <h1 className="text-[20.8px] font-bold text-gray-900 leading-snug tracking-tight">
            안녕하세요, {workerName || "..."} 님<br />
            <span className="text-blue-600">오늘의 작업</span>을 선택하세요.
          </h1>
        </section>

        {/* KPI 스트립 — 오늘의 요약 */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "오늘 입고", value: stats?.todayInbound, highlight: false },
            { label: "오늘 출고", value: stats?.todayOutbound, highlight: false },
            { label: "결재 대기", value: stats?.pendingApprovals, highlight: (stats?.pendingApprovals ?? 0) > 0 },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="bg-white rounded-2xl p-3 shadow-[0_4px_12px_rgba(149,157,165,0.06)]"
            >
              <div className="text-[11px] font-bold text-gray-400 tracking-tight whitespace-nowrap">
                {kpi.label}
              </div>
              <div
                className={`text-[22px] font-black leading-tight mt-1 ${
                  kpi.highlight ? "text-[#FF3B30]" : "text-gray-900"
                }`}
              >
                {stats === null ? "-" : `${kpi.value ?? 0}건`}
              </div>
            </div>
          ))}
        </div>

        {/* Hero 카드 — 입고·출고 (대형) */}
        <div className="grid grid-cols-2 gap-4">
          {heroItems.map((item) => (
            <button
              key={item.id}
              onClick={() => router.push(item.path)}
              className="bg-white p-5 rounded-[24px] flex flex-col items-start gap-4 shadow-[0_8px_24px_rgba(149,157,165,0.08)] active:scale-[0.96] transition-transform text-left border border-transparent active:border-blue-100 min-h-[180px]"
            >
              <div
                className="w-14 h-14 rounded-[20px] flex items-center justify-center shadow-inner"
                style={{ backgroundColor: item.iconBg }}
              >
                <item.Icon className="w-8 h-8 text-white" />
              </div>
              <div className="mt-auto">
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
    </div>
  );
}