"use client";

import { useState, useEffect } from "react";

interface RejectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  requesterName: string;
}

export default function RejectBottomSheet({ isOpen, onClose, onSubmit, requesterName }: RejectModalProps) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
      {/* 배경 어두워짐 (애니메이션 추가) */}
      <div 
        className="fixed inset-0 bg-black/50 animate-fade-in" 
        onClick={onClose}
      />

      {/* 바텀 시트 (animate-slide-up 적용) */}
      <div className="relative bg-white w-full max-w-md rounded-t-[28px] sm:rounded-[28px] p-7 pb-10 sm:pb-7 shadow-2xl animate-slide-up">
        {/* 드래그 핸들 (모바일 전용 시각 요소) */}
        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-8 sm:hidden" />

        <h3 className="text-[22px] font-bold text-gray-900 mb-2 leading-tight">
          반려 사유를<br/>입력해주세요
        </h3>
        <p className="text-gray-500 font-medium mb-8 text-[15px]">
          {requesterName}님에게 알림톡이 전송됩니다.
        </p>

        <textarea
        value={reason || ""} // ""을 추가해서 항상 '문자열'임을 보장합니다.
        onChange={(e) => setReason(e.target.value)}
          placeholder="이유를 간단히 적어주세요"
          className="w-full bg-gray-100 text-gray-900 text-lg rounded-2xl p-5 min-h-[140px] outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all resize-none mb-8"
          autoFocus
        />

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 bg-gray-100 text-gray-600 font-bold text-lg py-4 rounded-2xl active:scale-95 transition-transform"
          >
            취소
          </button>
          <button
            onClick={() => { if(reason) { onSubmit(reason); onClose(); } }}
            disabled={!reason.trim()}
            className={`flex-[2] font-bold text-lg py-4 rounded-2xl transition-all active:scale-95 ${
              reason.trim() ? "bg-blue-600 text-white shadow-lg shadow-blue-200" : "bg-gray-200 text-gray-400"
            }`}
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}