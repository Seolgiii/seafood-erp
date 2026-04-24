import React from 'react';
import { Receipt } from "lucide-react";
import { PDFButton } from '@/components/PDFButton';
import { ApprovalButtons } from '@/components/ApprovalButtons';
import PageHeader from '@/components/PageHeader';
import { isoDateToSlashDisplay } from '@/lib/inbound-date-input';

async function getExpenses() {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;

  if (!apiKey || !baseId) {
    return [];
  }

  try {
    const res = await fetch(
      `https://api.airtable.com/v0/${baseId}/지출결의?sort%5B0%5D%5Bfield%5D=날짜&sort%5B0%5D%5Bdirection%5D=desc`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        next: { revalidate: 0 },
      }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.records || [];
  } catch (error) {
    return [];
  }
}

export default async function ExpenseListPage() {
  const expenses = await getExpenses();

  return (
    <div className="bg-gray-50 min-h-screen pb-20">
      <PageHeader
        title="지출 내역 관리"
        rightSlot={<Receipt className="text-blue-600 shrink-0" size={20} />}
      />

      <div className="max-w-md mx-auto p-4 space-y-4">
        {expenses.length === 0 ? (
          <div className="py-20 text-center text-gray-400 font-bold">데이터가 없습니다.</div>
        ) : (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          expenses.map((item: any) => {
            const status = item.fields.승인상태 || '검토중';
            const statusColor = status === '승인완료' ? 'bg-green-100 text-green-700' : status === '반려' ? 'bg-red-100 text-red-700' : 'bg-blue-50 text-blue-600';
            const rawDate = item.fields.날짜;
            const dateLabel =
              typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(rawDate.trim())
                ? isoDateToSlashDisplay(rawDate.trim().slice(0, 10))
                : rawDate != null
                  ? String(rawDate)
                  : '';

            return (
              <div key={item.id} className="p-5 bg-white rounded-2xl border shadow-sm">
                <div className="flex justify-between items-start mb-3">
                  <span className="text-[10px] font-bold text-gray-400">{dateLabel}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${statusColor}`}>{status}</span>
                </div>
                <h3 className="font-bold text-lg mb-1">{item.fields.항목명 || '항목 없음'}</h3>
                <p className="text-sm text-gray-600 mb-2">{item.fields.적요 || '-'}</p>
                <p className="text-xl font-black text-gray-900 mb-4">
                  {Number(item.fields.금액 || 0).toLocaleString('ko-KR')}원
                </p>
                <div className="text-xs text-gray-500 space-y-1 mb-4">
                  <p>법인카드: {item.fields["법인카드 사용 유무"] || '-'}</p>
                  <p>비고: {item.fields.비고 || '-'}</p>
                </div>
                <div className="border-t pt-4">
                  <ApprovalButtons id={item.id} currentStatus={item.fields.승인상태} />
                  <PDFButton data={item.fields} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}