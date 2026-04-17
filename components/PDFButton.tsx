"use client";

import React, { useState, useEffect } from 'react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { ExpensePDF } from './ExpensePDF'; // [핵심] 중괄호 필수!
import { FileText } from "lucide-react";

// [핵심] export const 로 내보냅니다.
export const PDFButton = ({ data }: { data: any }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button className="w-full py-3 bg-gray-200 text-gray-500 rounded-xl text-sm font-bold flex justify-center items-center gap-2 cursor-wait">
        <FileText size={16} /> 문서 준비 중...
      </button>
    );
  }

  return (
    <PDFDownloadLink
      document={<ExpensePDF data={data} />}
      fileName={`지출결의서_${data.항목명 || '내역'}.pdf`}
      style={{ textDecoration: 'none' }}
    >
      {({ loading }) => (
        <button 
          disabled={loading}
          className={`w-full py-3 rounded-xl text-sm font-bold flex justify-center items-center gap-2 transition-all ${
            loading ? "bg-gray-400 text-white cursor-wait" : "bg-gray-900 text-white hover:bg-black active:scale-95"
          }`}
        >
          <FileText size={16} />
          {loading ? "PDF 문서 렌더링 중..." : "PDF 지출결의서 다운로드"}
        </button>
      )}
    </PDFDownloadLink>
  );
};