"use client";

import React, { useState, useEffect } from "react";
import { updateApprovalStatus } from "@/app/actions";
import { CheckCircle, XCircle } from "lucide-react";
import { readSession } from "@/lib/session";
import { toast } from "@/lib/toast";

export const ApprovalButtons = ({ id, currentStatus }: { id: string, currentStatus: string }) => {
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<string | undefined>(undefined);
  const [workerId, setWorkerId] = useState<string>("");

  useEffect(() => {
    const session = readSession();
    if (session) {
      setRole(session.role);
      setWorkerId(session.workerId);
    }
  }, []);

  if (currentStatus === "승인완료" || currentStatus === "반려") {
    return (
      <div className="w-full py-2 bg-gray-50 rounded-xl text-center text-xs font-bold text-gray-400 mb-3">
        결재 처리가 완료된 문서입니다.
      </div>
    );
  }

  if (role !== "ADMIN" && role !== "MASTER") return null;

  const handleStatusUpdate = async (status: '승인 완료' | '반려') => {
    if (!workerId) {
      toast("로그인 정보를 확인해주세요.");
      return;
    }
    setLoading(true);
    const result = await updateApprovalStatus(workerId, id, "EXPENSE", status);
    setLoading(false);
    if (!result.success) toast(result.message ?? "처리 중 오류가 발생했습니다.");
  };

  return (
    <div className="flex gap-2 mb-3">
      <button
        onClick={() => handleStatusUpdate("승인 완료")}
        disabled={loading}
        className="flex-1 py-2.5 bg-green-100 text-green-700 rounded-xl text-sm font-bold flex justify-center items-center gap-1 hover:bg-green-200 active:scale-95 transition-all"
      >
        <CheckCircle size={16} /> {loading ? "처리중..." : "승인"}
      </button>
      <button
        onClick={() => handleStatusUpdate("반려")}
        disabled={loading}
        className="flex-1 py-2.5 bg-red-100 text-red-700 rounded-xl text-sm font-bold flex justify-center items-center gap-1 hover:bg-red-200 active:scale-95 transition-all"
      >
        <XCircle size={16} /> {loading ? "처리중..." : "반려"}
      </button>
    </div>
  );
};