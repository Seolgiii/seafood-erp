"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeftIcon, ShieldExclamationIcon } from "@heroicons/react/24/outline";
import RejectBottomSheet from "@/app/components/RejectBottomSheet";
import { updateApprovalStatus, getMyRequests } from "@/app/actions";
import type { RequestItem } from "@/app/actions/my-requests";
import { readSession, isSessionExpired } from "@/lib/session";

const PENDING_STATUSES = ["승인 대기", "최종 승인 대기"];

const STATUS_STYLE: Record<string, string> = {
  "승인 대기": "bg-[#3182F6]/10 text-[#3182F6]",
  "최종 승인 대기": "bg-orange-50 text-orange-600",
  "승인 완료": "bg-green-100 text-green-700",
  "반려": "bg-gray-100 text-gray-500",
  "취소": "bg-red-50 text-red-400",
};

const TYPE_BADGE: Record<string, { bg: string; label: string }> = {
  INBOUND: { bg: "bg-[#3182F6]/10 text-[#3182F6]", label: "물품 입고" },
  OUTBOUND: { bg: "bg-[#5061FF]/10 text-[#5061FF]", label: "물품 출고" },
  EXPENSE: { bg: "bg-[#00D082]/10 text-[#00D082]", label: "지출 신청" },
};

function formatSubmittedAt(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [role, setRole] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<"ALL" | "EXPENSE" | "LOGISTICS" | "DONE">("ALL");
  const [items, setItems] = useState<RequestItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [uiOverrides, setUiOverrides] = useState<Record<string, "PROCESSING" | "COMPLETED" | "REJECTED">>({});

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<RequestItem | null>(null);

  useEffect(() => {
    const session = readSession();
    if (!session || isSessionExpired(session)) {
      router.replace("/login");
      return;
    }
    setRole(session.role);
    if (session.role === "ADMIN" || session.role === "MASTER") {
      setAuthorized(true);
    } else {
      setAuthorized(false);
    }
  }, [router]);

  const loadData = async () => {
    setIsLoading(true);
    setUiOverrides({});
    const data = await getMyRequests();
    setItems(data);
    setIsLoading(false);
  };

  useEffect(() => {
    if (authorized) loadData();
  }, [authorized]);

  const isDoneTab = activeTab === "DONE";

  const isItemPending = (item: RequestItem) => {
    const uiState = uiOverrides[item.id];
    if (uiState === "COMPLETED" || uiState === "REJECTED") return false;
    return PENDING_STATUSES.includes(item.status);
  };

  const filteredItems = items.filter((item) => {
    const pending = isItemPending(item);
    if (activeTab === "DONE") return !pending;
    if (!pending) return false;
    if (activeTab === "ALL") return true;
    if (activeTab === "EXPENSE") return item.type === "EXPENSE";
    if (activeTab === "LOGISTICS") return item.type === "INBOUND" || item.type === "OUTBOUND";
    return true;
  });

  const totalPending = items.filter(isItemPending).length;
  const totalCompleted = items.length - totalPending;

  const handleApprove = async (item: RequestItem) => {
    console.log("[handleApprove] entered", { id: item.id, type: item.type, status: item.status });

    if (!window.confirm("해당 건을 승인하시겠습니까?")) {
      console.log("[handleApprove] confirm cancelled");
      return;
    }

    setUiOverrides((prev) => ({ ...prev, [item.id]: "PROCESSING" }));

    let nextStatus: string;
    if (item.type === "EXPENSE" && item.status === "승인 대기") {
      const amount = Number(item.raw["금액"] ?? 0);
      if (amount < 1_000_000) {
        // 100만원 미만: 권한 무관 바로 승인 완료
        nextStatus = "승인 완료";
      } else if (role === "MASTER" && window.confirm("중간 승인을 생략하시겠습니까?")) {
        // 100만원 이상 + MASTER가 중간 승인 생략 선택
        nextStatus = "승인 완료";
      } else {
        // 100만원 이상 + ADMIN, 또는 MASTER가 생략 안 함 → 최종 승인 대기
        nextStatus = "최종 승인 대기";
      }
    } else {
      nextStatus = "승인 완료";
    }

    console.log("[handleApprove] calling updateApprovalStatus", { id: item.id, type: item.type, nextStatus });

    try {
      const result = await updateApprovalStatus(item.id, item.type, nextStatus);
      console.log("[handleApprove] result", result);

      if (result.success) {
        if (nextStatus === "최종 승인 대기") {
          loadData();
        } else {
          setUiOverrides((prev) => ({ ...prev, [item.id]: "COMPLETED" }));
        }
      } else {
        alert(result.message);
        loadData();
      }
    } catch (err) {
      console.error("[handleApprove] uncaught error", err);
      alert("승인 처리 중 오류가 발생했습니다.");
      loadData();
    }
  };

  const handleOpenReject = (item: RequestItem) => {
    setSelectedItem(item);
    setIsModalOpen(true);
  };

  const handleRejectSubmit = async (reason: string) => {
    if (!selectedItem) return;

    setUiOverrides((prev) => ({ ...prev, [selectedItem.id]: "PROCESSING" }));

    const result = await updateApprovalStatus(selectedItem.id, selectedItem.type, "반려", reason);

    if (result.success) {
      setUiOverrides((prev) => ({ ...prev, [selectedItem.id]: "REJECTED" }));
    } else {
      alert(result.message);
      loadData();
    }
  };

  const badge = (type: string) => TYPE_BADGE[type] ?? { bg: "bg-gray-100 text-gray-700", label: "기타" };

  const renderCard = (item: RequestItem) => {
    const uiState = uiOverrides[item.id];
    const b = badge(item.type);
    const isExpense = item.type === "EXPENSE";
    const description = isExpense ? String(item.raw["적요"] ?? "") : "";
    const displayStatus =
      uiState === "COMPLETED" ? "승인 완료" :
      uiState === "REJECTED"  ? "반려" :
      item.status;

    return (
      <div key={item.id} className={isExpense
        ? "bg-white p-5 rounded-[24px] shadow-[0_8px_24px_rgba(149,157,165,0.08)] flex flex-col gap-3 animate-fade-in"
        : "bg-white p-3.5 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-1"
      }>
        {isExpense ? (
          <div className="flex justify-between items-center gap-2">
            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
              <span className={`shrink-0 text-[12px] font-bold px-2.5 py-1 rounded-md ${b.bg}`}>{b.label}</span>
              <p className="text-[14px] text-gray-500 font-medium shrink-0 min-w-0">
                <span className="font-bold">신청자 :</span> {item.requester}
              </p>
              {formatSubmittedAt(item.createdTime) && (
                <p className="text-[14px] text-gray-500 font-medium min-w-0">
                  <span className="font-bold">접수 시간 :</span> {formatSubmittedAt(item.createdTime)}
                </p>
              )}
            </div>
            <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${STATUS_STYLE[displayStatus] ?? "bg-[#3182F6]/10 text-[#3182F6]"}`}>
              {displayStatus}
            </span>
          </div>
        ) : (
          <div className="flex justify-between items-center gap-2">
            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
              <span className={`shrink-0 text-[12px] font-bold px-2.5 py-1 rounded-md ${b.bg}`}>{b.label}</span>
              <p className="text-[14px] text-gray-500 font-medium shrink-0 min-w-0">
                <span className="font-bold">신청자 :</span> {item.requester}
              </p>
              {formatSubmittedAt(item.createdTime) && (
                <p className="text-[14px] text-gray-500 font-medium min-w-0">
                  <span className="font-bold">접수 시간 :</span> {formatSubmittedAt(item.createdTime)}
                </p>
              )}
            </div>
            <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${STATUS_STYLE[displayStatus] ?? "bg-[#3182F6]/10 text-[#3182F6]"}`}>
              {displayStatus}
            </span>
          </div>
        )}

        {isExpense ? (
          <>
            <h2 className="text-[19px] font-bold text-gray-900 tracking-tight min-w-0">
              건명 : {item.title || "-"}
            </h2>
            <div className="flex justify-between items-center gap-3 min-w-0">
              {description ? (
                <p className="text-gray-400 font-medium text-[14px] min-w-0 flex-1 leading-snug">
                  적요 : {description}
                </p>
              ) : (
                <div className="min-w-0 flex-1" />
              )}
              <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                <span className="text-[17.6px] font-bold text-gray-800">금액 :</span>
                <span className="text-[17.6px] font-bold text-[#191F28]">{item.amountOrQuantity}</span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex gap-3">
              <p className="text-[14px] text-gray-700">
                <span className="font-bold">규격 :</span> {item.spec || "-"}
              </p>
              <p className="text-[14px] text-gray-700">
                <span className="font-bold">미수 :</span> {item.misu || "-"}
              </p>
            </div>
            <h2 className="text-[19px] font-bold text-gray-900 tracking-tight">{item.title || "-"}</h2>
            <div className="flex justify-between items-center gap-3 min-w-0">
              {item.lotNumber ? (
                <p className="text-[15px] font-bold font-mono text-blue-700 tracking-tight break-all leading-snug min-w-0 flex-1">
                  {item.lotNumber}
                </p>
              ) : (
                <p className="text-[15px] font-mono text-gray-300 tracking-tight min-w-0 flex-1 leading-snug">
                  LOT 미부여
                </p>
              )}
              <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                <span className="text-[17.6px] font-bold text-gray-800">
                  {item.type === "INBOUND" ? "입고 수량" : "출고 수량"} :
                </span>
                <span className="text-[17.6px] font-bold text-blue-600">{item.amountOrQuantity} BOX</span>
              </div>
            </div>
          </>
        )}

        {!uiState && PENDING_STATUSES.includes(item.status) && (role === "ADMIN" || role === "MASTER") && (
          <div className={`flex gap-3 ${isExpense ? "mt-1.5" : "mt-0.5"}`}>
            <button
              onClick={() => handleOpenReject(item)}
              className="flex-1 bg-gray-100 text-gray-600 font-bold text-[16px] py-4 rounded-[16px] active:scale-95 transition-transform"
            >
              반려
            </button>
            <button
              onClick={() => handleApprove(item)}
              className="flex-[2] bg-[#191F28] text-white font-bold text-[16px] py-4 rounded-[16px] active:scale-95 transition-transform"
            >
              승인
            </button>
          </div>
        )}

        {uiState === "PROCESSING" && (
          <div className="w-full bg-blue-50/50 text-[#3182F6] font-bold py-4 rounded-[16px] text-center flex items-center justify-center gap-2 animate-pulse">
            처리 중...
          </div>
        )}
        {uiState === "COMPLETED" && (
          <div className="w-full bg-[#00D082]/10 text-[#00D082] font-bold py-4 rounded-[16px] text-center flex items-center justify-center gap-2">
            승인 완료
          </div>
        )}
        {uiState === "REJECTED" && (
          <div className="w-full bg-gray-50 text-gray-400 font-bold py-4 rounded-[16px] text-center">
            반려됨
          </div>
        )}
      </div>
    );
  };

  if (authorized === null) {
    return (
      <div className="min-h-screen bg-[#F2F4F6] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-gray-200 border-t-[#3182F6] rounded-full animate-spin" />
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="min-h-screen bg-[#F2F4F6] flex flex-col items-center justify-center gap-5 px-6">
        <ShieldExclamationIcon className="w-16 h-16 text-gray-300" />
        <h1 className="text-[22px] font-bold text-gray-800">접근 권한이 없습니다</h1>
        <p className="text-gray-500 font-medium text-center">관리자 시스템은 ADMIN 권한이 필요합니다.</p>
        <Link
          href="/"
          className="mt-4 px-8 py-3.5 bg-[#191F28] text-white font-bold text-[16px] rounded-2xl active:scale-95 transition-transform"
        >
          홈으로 돌아가기
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F2F4F6] flex flex-col pb-10" style={{ fontFamily: "'Spoqa Han Sans Neo', 'sans-serif'" }}>
      <header className="bg-white px-4 py-4 flex items-center justify-between sticky top-0 z-10 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">
        <div className="flex items-center">
          <Link href="/" className="p-2 -ml-2 shrink-0" aria-label="홈으로 돌아가기">
            <ChevronLeftIcon className="w-6 h-6 text-gray-600" />
          </Link>
          <h1 className="text-[20px] font-bold text-gray-900 tracking-tight ml-2">결재 수신함</h1>
        </div>
        <div className="text-[13px] font-bold text-white bg-[#191F28] px-3 py-1.5 rounded-lg shadow-sm">
          관리자 시스템
        </div>
      </header>

      <nav className="bg-white flex border-b border-gray-100">
        {[
          { key: "ALL", label: "전체" },
          { key: "EXPENSE", label: "지출결의" },
          { key: "LOGISTICS", label: "입/출고" },
          { key: "DONE", label: "완료" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={`flex-1 py-4 text-center font-bold text-[16px] transition-colors border-b-[3px] ${
              activeTab === tab.key ? "border-[#191F28] text-[#191F28]" : "border-transparent text-gray-400"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* 건수 요약 */}
      {!isLoading && (
        <div className="px-5 pt-4 pb-1 flex items-center gap-3">
          <p className="text-[13px] font-bold text-gray-400">
            {filteredItems.length}건
          </p>
          {!isDoneTab && totalCompleted > 0 && (
            <span className="text-[13px] font-bold text-gray-300">
              완료 {totalCompleted}건
            </span>
          )}
          {isDoneTab && totalPending > 0 && (
            <span className="text-[13px] font-bold text-[#3182F6]">
              처리 중 {totalPending}건
            </span>
          )}
        </div>
      )}

      <main className="flex-1 p-5 pt-2 flex flex-col gap-4">
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 border-4 border-gray-200 border-t-[#3182F6] rounded-full animate-spin"></div>
            <p className="text-gray-400 font-bold">에어테이블 연결 중...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 font-bold text-[16px]">
            {isDoneTab ? "완료된 내역이 없습니다." : "대기 중인 결재가 없습니다."}
          </div>
        ) : (
          filteredItems.map((item) => renderCard(item))
        )}
      </main>

      {selectedItem && (
        <RejectBottomSheet
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSubmit={handleRejectSubmit}
          requesterName={selectedItem.requester}
        />
      )}
    </div>
  );
}
