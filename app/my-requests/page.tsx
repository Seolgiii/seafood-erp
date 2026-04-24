"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getMyRequests, cancelMyRequest } from "@/app/actions/my-requests";
import type { RequestItem } from "@/app/actions/my-requests";
import { readSession } from "@/lib/session";
import PageHeader from "@/components/PageHeader";
import BottomTabBar from "@/components/BottomTabBar";

type TabKey = "ALL" | "LOGISTICS" | "EXPENSE" | "DONE";

const TABS: { key: TabKey; label: string }[] = [
  { key: "ALL", label: "전체" },
  { key: "LOGISTICS", label: "입출고" },
  { key: "EXPENSE", label: "지출결의" },
  { key: "DONE", label: "완료" },
];

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

export default function MyRequestsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>("ALL");
  const isDoneTab = activeTab === "DONE";
  const [items, setItems] = useState<RequestItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const session = readSession();
      const role = session?.role;
      const isFullAccess = role === "ADMIN" || role === "MASTER";
      const data = await getMyRequests(
        isFullAccess ? undefined : session?.workerName,
        isFullAccess ? undefined : session?.workerId,
      );
      setItems(data);
    } catch {
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = items.filter((item) => {
    const isPending = PENDING_STATUSES.includes(item.status);
    if (activeTab === "DONE") return !isPending;
    if (!isPending) return false;
    if (activeTab === "ALL") return true;
    if (activeTab === "EXPENSE") return item.type === "EXPENSE";
    if (activeTab === "LOGISTICS") return item.type === "INBOUND" || item.type === "OUTBOUND";
    return true;
  });

  const totalPending = items.filter((i) => PENDING_STATUSES.includes(i.status)).length;
  const totalCompleted = items.length - totalPending;

  const handleCancel = async (item: RequestItem) => {
    if (item.status !== "승인 대기") return;
    if (!window.confirm("이 신청 건을 취소하시겠습니까?")) return;

    setCancellingId(item.id);
    const result = await cancelMyRequest(item.id, item.type);

    if (result.success) {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: "취소" as const } : i)),
      );
    } else {
      alert(result.message);
    }
    setCancellingId(null);
  };

  const isInbound = (t: string) => t === "INBOUND";
  const qtyLabel = (item: RequestItem) =>
    isInbound(item.type) ? "입고 수량" : "출고 수량";
  const cancelLabel = (item: RequestItem) =>
    isInbound(item.type) ? "입고 신청 취소" : "출고 신청 취소";

  // --- 입/출고 카드 (여백·타이포: 관리자 시스템 카드와 통일) ---
  const LogisticsCard = ({ item }: { item: RequestItem }) => (
    <div className="bg-white p-3.5 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-1">
      <div className="flex justify-between items-center gap-2">
        <p className="text-[14px] text-gray-500 min-w-0">
          <span className="font-bold">접수 시간 :</span> {formatSubmittedAt(item.createdTime) ?? "-"}
        </p>
        <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${STATUS_STYLE[item.status]}`}>
          {item.status}
        </span>
      </div>

      <div className="flex gap-3">
        <p className="text-[14px] text-gray-700">
          <span className="font-bold">규격 :</span> {item.spec || "-"}
        </p>
        <p className="text-[14px] text-gray-700">
          <span className="font-bold">미수 :</span> {item.misu || "-"}
        </p>
      </div>

      <h2 className="text-[17px] font-bold text-gray-900 tracking-tight">{item.title || "-"}</h2>

      <div className="flex justify-between items-center gap-3 min-w-0">
        {item.lotNumber ? (
          <p className="text-[15px] font-bold font-mono text-blue-700 tracking-tight break-all leading-snug min-w-0 flex-1">
            {item.lotNumber}
          </p>
        ) : (
          <p className="text-[15px] font-mono text-gray-300 tracking-tight min-w-0 flex-1 leading-snug">LOT 미부여</p>
        )}
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          <span className="text-[15.6px] font-bold text-gray-800">{qtyLabel(item)} :</span>
          <span className="text-[15.6px] font-bold text-blue-600">{item.amountOrQuantity} BOX</span>
        </div>
      </div>

      {item.status === "반려" && item.rejectReason && (
        <div className="bg-gray-50 rounded-xl px-4 py-3 text-[13px] text-gray-500">
          <span className="font-bold text-gray-600">반려사유 :</span> {item.rejectReason}
        </div>
      )}

      {item.status === "승인 대기" && (
        <button
          onClick={() => handleCancel(item)}
          disabled={cancellingId === item.id}
          className="w-full mt-0.5 bg-red-50 text-red-500 font-bold text-[15px] py-3.5 rounded-2xl active:scale-[0.97] transition-transform disabled:opacity-50"
        >
          {cancellingId === item.id ? "취소 중..." : cancelLabel(item)}
        </button>
      )}
    </div>
  );

  // --- 지출결의 카드 (여백·레이아웃: 관리자 시스템 지출 카드와 통일) ---
  const ExpenseCard = ({ item }: { item: RequestItem }) => {
    const description = String(item.raw["적요"] ?? "");
    return (
      <div className="bg-white p-5 rounded-[24px] shadow-[0_8px_24px_rgba(149,157,165,0.08)] flex flex-col gap-3 animate-fade-in">
        <div className="flex justify-between items-center gap-2">
          <p className="text-[14px] text-gray-500 min-w-0">
            <span className="font-bold">접수 시간 :</span> {formatSubmittedAt(item.createdTime) ?? "-"}
          </p>
          <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${STATUS_STYLE[item.status]}`}>
            {item.status}
          </span>
        </div>

        <h2 className="text-[17px] font-bold text-gray-900 tracking-tight min-w-0">
          건명 : {item.title || "-"}
        </h2>

        <div className="flex justify-between items-center gap-3 min-w-0">
          {description ? (
            <p className="text-gray-400 font-medium text-[14px] min-w-0 flex-1 leading-snug">적요 : {description}</p>
          ) : (
            <div className="min-w-0 flex-1" />
          )}
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            <span className="text-[15.6px] font-bold text-gray-800">금액 :</span>
            <span className="text-[15.6px] font-bold text-[#191F28]">{item.amountOrQuantity}</span>
          </div>
        </div>

        {item.status === "반려" && item.rejectReason && (
          <div className="bg-gray-50 rounded-xl px-4 py-3 text-[13px] text-gray-500">
            <span className="font-bold text-gray-600">반려사유 :</span> {item.rejectReason}
          </div>
        )}

        {item.status === "승인 대기" && (
          <button
            onClick={() => handleCancel(item)}
            disabled={cancellingId === item.id}
            className="w-full mt-0.5 bg-red-50 text-red-500 font-bold text-[16px] py-4 rounded-[16px] active:scale-[0.97] transition-transform disabled:opacity-50"
          >
            {cancellingId === item.id ? "취소 중..." : "신청 취소"}
          </button>
        )}
      </div>
    );
  };

  // --- 전체 탭: 타입에 따라 카드 분기 ---
  const RequestCard = ({ item }: { item: RequestItem }) => {
    if (item.type === "EXPENSE") return <ExpenseCard item={item} />;
    return <LogisticsCard item={item} />;
  };

  return (
    <div
      className="min-h-screen bg-[#F2F4F6] flex flex-col"
      style={{ paddingBottom: "calc(56px + env(safe-area-inset-bottom))" }}
    >
      {/* 상단 헤더 */}
      <PageHeader title="신청 내역" />

      {/* 건수 요약 */}
      {!isLoading && (
        <div className="px-5 pt-4 pb-1 flex items-center gap-3">
          <p className="text-[13px] font-bold text-gray-400">
            {filtered.length}건
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

      {/* 리스트 영역 */}
      <main className="flex-1 p-5 pt-2 pb-5 flex flex-col gap-4">
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 pt-20">
            <div className="w-10 h-10 border-4 border-gray-200 border-t-[#3182F6] rounded-full animate-spin" />
            <p className="text-gray-400 font-bold">데이터를 불러오는 중...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 pt-20">
            <p className="text-[40px]">📋</p>
            <p className="text-gray-400 font-bold text-[16px]">
              {isDoneTab ? "완료된 내역이 없습니다" : "처리 중인 신청이 없습니다"}
            </p>
          </div>
        ) : (
          filtered.map((item) => <RequestCard key={item.id} item={item} />)
        )}
      </main>

      {/* 하단 탭바 */}
      <BottomTabBar<TabKey>
        tabs={TABS}
        activeKey={activeTab}
        onChange={setActiveTab}
      />
    </div>
  );
}
