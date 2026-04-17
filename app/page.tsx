"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { clearSession, readSession } from "@/lib/session";

export default function WorkerDashboard() {
  const router = useRouter();
  const [isOnline, setIsOnline] = useState(true);
  const [workerName, setWorkerName] = useState("");
  const [role, setRole] = useState<string | undefined>(undefined);

  useEffect(() => {
    const session = readSession();
    if (session) {
      setWorkerName(session.workerName);
      setRole(session.role);
    }
  }, []);

  const handleLogout = () => {
    if (!window.confirm("정말 로그아웃 하시겠습니까?")) return;
    clearSession();
    router.replace("/login");
  };

  const allMenuItems = [
    { id: "inbound", title: "물품 입고", desc: "새로운 원물 등록", icon: "📥", iconBg: "#3182F6", path: "/inventory/record" },
    { id: "outbound", title: "물품 출고", desc: "바코드 즉시 출고", icon: "📤", iconBg: "#FF3B30", path: "/inventory/outbound" },
    { id: "status", title: "재고 조회", desc: "실시간 현장 재고", icon: "🔍", iconBg: "#8B95A1", path: "/inventory/status" },
    { id: "expense-new", title: "지출 신청", desc: "자재/경비 결의서", icon: "💳", iconBg: "#00D082", path: "/expense/new" },
    { id: "my-requests", title: "신청 내역", desc: "내 신청 현황 조회", icon: "📋", iconBg: "#FF8C00", path: "/my-requests" },
    { id: "admin-system", title: "관리자 시스템", desc: "결재 및 통합 관리", icon: "⚙️", iconBg: "#191F28", path: "/admin/dashboard", adminOnly: true },
  ];

  const menuItems = allMenuItems.filter(
    (item) => !item.adminOnly || role === "ADMIN" || role === "MASTER"
  );

  return (
    // font-sans 클래스 대신 명시적으로 style 속성이나 globals.css의 설정을 따릅니다.
    <div className="min-h-screen bg-[#F2F4F6] flex flex-col pb-10" style={{ fontFamily: "'Spoqa Han Sans Neo', 'sans-serif'" }}>
      
      {/* 상단 헤더 */}
      <header className="bg-white px-5 py-4 flex justify-between items-center sticky top-0 z-20 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">
        <button
          onClick={handleLogout}
          className="bg-[#FF4545] text-white font-bold py-2 px-4 rounded-xl active:scale-95 transition-transform text-sm"
        >
          로그아웃
        </button>

        <div className="text-right leading-tight">
          <p className="text-[12px] text-gray-500 font-medium">
            {role === "ADMIN" || role === "MASTER" ? "관리자" : "작업자"}
          </p>
          <p className="text-[16px] font-bold text-gray-900">
            {workerName ? `${workerName} 님` : "로그인 중..."}
          </p>
        </div>
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

        {/* 2단 그리드 메뉴 (grid-cols-2) */}
        <div className="grid grid-cols-2 gap-4">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => router.push(item.path)}
              className="bg-white p-5 rounded-[24px] flex flex-col items-start gap-4 shadow-[0_8px_24px_rgba(149,157,165,0.08)] active:scale-[0.96] transition-transform text-left border border-transparent active:border-blue-100"
            >
              {/* 아이콘 크기 및 둥글기 조절 */}
              <div
                className="w-12 h-12 rounded-[18px] flex items-center justify-center text-2xl shadow-inner"
                style={{ backgroundColor: item.iconBg }}
              >
                {item.icon}
              </div>
              
              {/* 텍스트 영역 상하 배치 */}
              <div className="mt-1">
                <h2 className="text-[17px] font-bold text-gray-900 tracking-tight">{item.title}</h2>
                <p className="text-[13px] text-gray-400 font-medium mt-1 tracking-tight break-keep">{item.desc}</p>
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