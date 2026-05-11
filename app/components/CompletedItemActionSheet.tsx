"use client";

import { useEffect } from "react";
import type { RequestItem } from "@/app/actions/my-requests";

const TYPE_LABEL: Record<string, string> = {
  INBOUND: "물품 입고",
  OUTBOUND: "물품 출고",
  EXPENSE: "지출 신청",
  TRANSFER: "재고 이동",
};

interface Props {
  item: RequestItem | null;
  isOpen: boolean;
  onClose: () => void;
  /** "승인 완료" 카드 → 반려로 변경 클릭 시 호출 */
  onRevertToReject: () => void;
  /** "반려" 카드 → 승인으로 변경 클릭 시 호출 */
  onChangeToApprove: () => void;
}

export default function CompletedItemActionSheet({
  item,
  isOpen,
  onClose,
  onRevertToReject,
  onChangeToApprove,
}: Props) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen || !item) return null;

  const typeLabel = TYPE_LABEL[item.type] ?? "기타";
  const isExpense = item.type === "EXPENSE";
  const isTransfer = item.type === "TRANSFER";
  const isApproved = item.status === "승인 완료";
  const isRejected = item.status === "반려";

  // 상태별 안내 문구·버튼 라벨
  const statusBadgeColor = isApproved
    ? "text-green-700"
    : isRejected
      ? "text-gray-500"
      : "text-gray-700";

  const helperText = isApproved
    ? "잘못 승인된 건이거나 반려가 필요한 경우 아래 버튼으로 상태를 변경할 수 있습니다. 입고/출고는 반영됐던 재고가 자동으로 원상 복구됩니다."
    : isRejected
      ? isTransfer
        ? "재고 이동은 반려 후 자동 재승인이 지원되지 않습니다. 다시 처리하려면 새로 신청해주세요."
        : "잘못 반려된 건이거나 다시 승인이 필요한 경우 아래 버튼으로 상태를 되돌릴 수 있습니다. 입고/출고는 LOT 재고가 자동으로 다시 반영됩니다."
      : "";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
      <div
        className="fixed inset-0 bg-black/50 animate-fade-in"
        onClick={onClose}
      />
      <div className="relative bg-white w-full max-w-md rounded-t-[28px] sm:rounded-[28px] p-7 pb-10 sm:pb-7 shadow-2xl animate-slide-up">
        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-6 sm:hidden" />

        <p className="text-[13px] font-bold text-gray-400 mb-1">{typeLabel}</p>
        <h3 className="text-[20px] font-bold text-gray-900 mb-3 leading-tight break-keep">
          {item.title || "-"}
        </h3>

        <div className="flex flex-col gap-1.5 text-[14px] text-gray-600 mb-6 bg-gray-50 rounded-2xl p-4">
          <p>
            <span className="font-bold text-gray-700">신청자:</span> {item.requester}
          </p>
          {item.amountOrQuantity && (
            <p>
              <span className="font-bold text-gray-700">
                {isExpense ? "금액" : "수량"}:
              </span>{" "}
              <span className="font-bold text-gray-900">
                {item.amountOrQuantity}
                {!isExpense ? "박스" : ""}
              </span>
            </p>
          )}
          {item.lotNumber && (
            <p className="font-mono text-blue-700">
              <span className="font-bold">LOT:</span> {item.lotNumber}
            </p>
          )}
          <p>
            <span className="font-bold text-gray-700">현재 상태:</span>{" "}
            <span className={`font-bold ${statusBadgeColor}`}>{item.status}</span>
          </p>
        </div>

        {helperText && (
          <p className="text-[13px] text-gray-500 mb-5 leading-relaxed">
            {helperText}
          </p>
        )}

        <div className="flex flex-col gap-3">
          {isApproved && (
            <button
              type="button"
              onClick={onRevertToReject}
              className="w-full bg-red-600 text-white font-bold text-[16px] py-4 rounded-2xl shadow-lg shadow-red-200 active:scale-95 transition-transform"
            >
              반려로 변경
            </button>
          )}
          {isRejected && !isTransfer && (
            <button
              type="button"
              onClick={onChangeToApprove}
              className="w-full bg-green-600 text-white font-bold text-[16px] py-4 rounded-2xl shadow-lg shadow-green-200 active:scale-95 transition-transform"
            >
              승인으로 변경
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-full bg-gray-100 text-gray-600 font-bold text-[16px] py-4 rounded-2xl active:scale-95 transition-transform"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
