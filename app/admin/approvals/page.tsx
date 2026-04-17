'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowDownOnSquareStackIcon,
  ArrowUpOnSquareStackIcon,
  ChartBarIcon,
  DocumentTextIcon,
  Cog6ToothIcon
} from '@heroicons/react/24/outline';
import { readSession } from '@/lib/session';

export default function Home() {
  const [workerName, setWorkerName] = useState('');

  useEffect(() => {
    const s = readSession();
    if (s) setWorkerName(s.workerName);
  }, []);

  // 로그아웃 더블 확인 방어 로직
  const handleLogout = () => {
    if (window.confirm("정말 로그아웃 하시겠습니까?")) {
      alert("로그아웃 되었습니다.");
      // 실제 로그인 연동 시 라우팅 추가 필요
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col font-sans">
      {/* 상단 헤더 */}
      <div className="bg-white px-5 py-4 flex justify-between items-center shadow-sm sticky top-0 z-10">
        <button 
          onClick={handleLogout} 
          className="px-4 py-2 bg-red-500 text-white text-sm font-black rounded-xl active:scale-95 shadow-md"
        >
          로그아웃
        </button>
        <div className="text-right">
          <p className="text-[10px] text-gray-400 font-bold mb-0.5">로그인됨</p>
          <h1 className="text-lg font-black text-gray-800">{workerName || "..."}</h1>
        </div>
      </div>

      <div className="flex-1 p-5 flex flex-col justify-center gap-4">
        
        <div className="mb-1">
          <h2 className="text-2xl font-black text-gray-800">수산물 ERP</h2>
          <p className="text-sm font-bold text-gray-500 mt-1">현장 작업을 선택해주세요.</p>
        </div>

        {/* 1층: 입고모드 / 출고모드 */}
        <div className="grid grid-cols-2 gap-4 mt-2">
          {/* 🔵 입고모드 */}
          <Link href="/inventory/record" className="block col-span-1">
            <div className="bg-[#3182F6] p-5 rounded-[1.5rem] shadow-lg active:scale-95 transition-transform flex flex-col items-start justify-between h-full min-h-[140px]">
              <ArrowDownOnSquareStackIcon className="w-8 h-8 text-white mb-2" />
              <div>
                <p className="text-blue-100 font-bold text-sm mb-1">새 재고 등록</p>
                <h3 className="text-xl font-black text-white">입고모드</h3>
              </div>
            </div>
          </Link>

          {/* 🔴 출고모드 */}
          <Link href="/inventory/outbound" className="block col-span-1">
            <div className="bg-[#5061FF] p-5 rounded-[1.5rem] shadow-lg active:scale-95 transition-transform flex flex-col items-start justify-between h-full min-h-[140px]">
              <ArrowUpOnSquareStackIcon className="w-8 h-8 text-white mb-2" />
              <div>
                <p className="text-red-100 font-bold text-sm mb-1">재고 차감</p>
                <h3 className="text-xl font-black text-white">출고모드</h3>
              </div>
            </div>
          </Link>
        </div>

        {/* 2층: 재고 조회 / 지출 결의서 신청 */}
        <div className="grid grid-cols-2 gap-4">
          <Link href="/inventory/status" className="block col-span-1">
            <div className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-gray-100 active:scale-95 transition-transform h-full">
              <ChartBarIcon className="w-8 h-8 text-[#8B95A1] mb-2" />
              <h4 className="text-base font-black text-gray-800">재고 조회</h4>
              <p className="text-xs font-bold text-gray-400 mt-1">실시간 수량 확인</p>
            </div>
          </Link>
          
          {/* ⚪ 지출 결의서 (등록 폼으로 이동) */}
          {/* 주의: 기존 지출 등록 페이지 주소가 /expense/record 라면 아래 href를 맞춰서 수정해주세요! */}
          <Link href="/expense/record" className="block col-span-1">
            <div className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-gray-100 active:scale-95 transition-transform h-full">
              <DocumentTextIcon className="w-8 h-8 text-[#00D082] mb-2" />
              <h4 className="text-base font-black text-gray-800">지출 결의서</h4>
              <p className="text-xs font-bold text-gray-400 mt-1">새로운 지출 신청</p>
            </div>
          </Link>
        </div>

        {/* 3층: 관리 시스템 (두 번째 사진의 지출 내역/결재 리스트로 바로 연결) */}
        <Link href="/expense/list" className="block mt-2">
          <div className="bg-gray-200 p-5 rounded-[1.5rem] shadow-sm border border-gray-300 active:scale-95 transition-transform flex items-center gap-4">
            <Cog6ToothIcon className="w-8 h-8 text-[#191F28] shrink-0" />
            <div>
              <h4 className="text-lg font-black text-gray-800">관리 시스템</h4>
              <p className="text-sm font-bold text-gray-500 mt-1">지출 내역 결재 및 시스템 관리</p>
            </div>
          </div>
        </Link>

      </div>
    </main>
  );
}