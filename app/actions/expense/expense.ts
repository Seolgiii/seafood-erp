"use server";

import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

// 인원 정보 가져오기
export async function getApplicantInfo(name: string) {
  try {
    const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/작업자?filterByFormula={작업자명}='${name}'`, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    const data = await response.json();
    console.log("getApplicantInfo response", {
      status: response.status,
      recordsCount: data.records?.length ?? 0,
      firstRecordId: data.records?.[0]?.id ?? null,
    });
    const record = data.records?.[0];
    if (!record) {
      console.warn("getApplicantInfo no record found", { name });
      return null;
    }
    return { ...record.fields, _recordId: record.id };
  } catch (error) {
    console.error("getApplicantInfo failed", error);
    return null;
  }
}

// 지출결의 신청
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createExpenseRecord(formData: any) {
  try {
    const expenseDate = typeof formData.date === "string" ? formData.date.trim() : "";
    const createdDate = new Date().toISOString().split("T")[0];
    const applicantRecordId =
      typeof formData.applicantRecordId === "string" ? formData.applicantRecordId.trim() : "";
    if (!applicantRecordId) {
      return { success: false, error: "신청자 레코드 ID를 찾지 못했습니다." };
    }

    const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/지출결의`, {
      method: "POST",
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          "지출일": expenseDate,
          "작성일": createdDate,
          "건명": formData.title,
          "적요": formData.description,
          "금액": Number(formData.amount),
          "법인카드 사용 유무": formData.isCorpCard ? "유" : "무",
          "비고": formData.remarks || "",
          "승인상태": "승인 대기",
          "신청자": [applicantRecordId],
          "영수증사진": formData.receiptUrl ? [{ url: formData.receiptUrl }] : [],
          // ... 기타 필드
        }
      }),
    });

    if (!response.ok) {
      let errorMessage = `Airtable 저장 실패 (${response.status})`;
      let responseBody: string | null = null;
      const errorJson = await response.clone().json().catch(() => null);
      const apiError =
        errorJson?.error?.message ||
        errorJson?.error ||
        errorJson?.message;

      if (apiError) {
        responseBody = String(apiError);
        errorMessage = `${errorMessage}: ${String(apiError)}`;
      } else {
        const errorText = await response.text().catch(() => "");
        if (errorText) {
          responseBody = errorText;
          errorMessage = `${errorMessage}: ${errorText}`;
        }
      }

      console.error("createExpenseRecord Airtable response error", {
        status: response.status,
        body: responseBody,
      });

      return { success: false, error: errorMessage };
    }

    revalidatePath("/expense/list");
    revalidatePath("/admin/dashboard");
    return { success: true };
  } catch (error) {
    console.error("createExpenseRecord unexpected error", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "지출 저장 중 오류가 발생했습니다.",
    };
  }
}

// 이미지 업로드 (현재 페이지에서는 /api/upload-receipt 직접 호출 방식으로 대체됨)
export async function uploadReceipt(formData: FormData) {
  const file = formData.get("file") as File;
  if (!file) {
    console.error("[uploadReceipt] file이 없습니다. 서버 액션 body 크기 제한(1MB)을 초과했을 수 있습니다.");
    return { success: false, url: null };
  }
  try {
    const blob = await put(`receipts/${Date.now()}-${file.name}`, file, { access: "public" });
    return { success: true, url: blob.url };
  } catch (error) {
    console.error("[uploadReceipt] Blob 업로드 실패:", error);
    return { success: false, url: null };
  }
}
