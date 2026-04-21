'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeftIcon,
  FunnelIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { LOT_FIELDS } from '@/lib/airtable-schema';
import {
  formatLotSpecDisplayLine,
  firstLotStringField,
} from '@/lib/spec-display';

type LotStockRecord = { id: string; fields: Record<string, unknown> };

function lotProductTitle(fields: Record<string, unknown>): string {
  const nameField = fields['품목명'];
  if (typeof nameField === 'string' && nameField.trim()) return nameField.trim();
  const p = fields['품목'];
  if (typeof p === 'string' && p.trim()) return p.trim();
  if (Array.isArray(p) && p.length) {
    const first = p[0];
    if (typeof first === 'string' && first.trim() && !first.startsWith('rec')) {
      return first.trim();
    }
  }
  return '-';
}

export default function StockStatusPage() {
  const [stocks, setStocks] = useState<LotStockRecord[]>([]);
  const [filteredStocks, setFilteredStocks] = useState<LotStockRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const [filters, setFilters] = useState({
    searchTerm: '',
    startDate: '',
    endDate: '',
    spec: '',
    count: '',
    origin: '',
  });

  const fetchStocks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/inventory/lot-stock");
      if (!res.ok) throw new Error(`서버 오류 (${res.status})`);
      const data = await res.json();
      const rows = (data.records ?? []) as LotStockRecord[];
      setStocks(rows);
      setFilteredStocks(rows);
    } catch (error) {
      console.error("데이터 로드 실패:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStocks();
  }, [fetchStocks]);

  const applyFilters = () => {
    let result = [...stocks];

    if (filters.searchTerm) {
      const q = filters.searchTerm;
      result = result.filter((s) => lotProductTitle(s.fields).includes(q));
    }
    if (filters.spec) {
      const q = filters.spec;
      result = result.filter((s) => {
        const line = formatLotSpecDisplayLine(s.fields);
        const raw = firstLotStringField(s.fields, ['규격표시', '규격']);
        return line.includes(q) || raw.includes(q);
      });
    }
    if (filters.count) {
      const q = filters.count;
      result = result.filter((s) => {
        const misu = String(s.fields['미수'] ?? '');
        const d1 = String(s.fields['상세규격_표기'] ?? '');
        const d2 = String(s.fields['상세규격'] ?? '');
        return misu.includes(q) || d1.includes(q) || d2.includes(q);
      });
    }

    setFilteredStocks(result);
    setIsFilterOpen(false);
  };

  const resetFilters = () => {
    setFilters({ searchTerm: '', startDate: '', endDate: '', spec: '', count: '', origin: '' });
    setFilteredStocks(stocks);
    setIsFilterOpen(false);
  };

  return (
    <main className="min-h-screen bg-gray-50 pb-10 relative" style={{ fontFamily: "'Spoqa Han Sans Neo', sans-serif" }}>
      {/* 상단 헤더 */}
      <div className="bg-white border-b px-4 py-4 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center">
          <Link href="/" className="p-2 -ml-2"><ChevronLeftIcon className="w-6 h-6 text-gray-600" /></Link>
          <h1 className="text-lg font-bold text-gray-800 ml-2">실시간 재고 현황</h1>
        </div>
        <button
          onClick={() => setIsFilterOpen(true)}
          className="p-2 bg-blue-50 rounded-xl text-blue-600 active:scale-95 transition-all"
        >
          <FunnelIcon className="w-6 h-6" />
        </button>
      </div>

      {/* 재고 리스트 */}
      <div className="bg-white mt-2 px-4">
        {loading ? (
          <div className="text-center py-20 text-gray-400">최신 재고를 불러오는 중...</div>
        ) : filteredStocks.length > 0 ? (
          filteredStocks.map((stock) => {
            const specRaw = firstLotStringField(stock.fields, ['규격표시', '규격']);
            const misuRaw = firstLotStringField(stock.fields, ['미수', '상세규격_표기', '상세규격']);
            const rawStockKg = stock.fields['재고수량'];
            const stockKg = Number(Array.isArray(rawStockKg) ? rawStockKg[0] : rawStockKg) || 0;
            const lotNo = String(stock.fields[LOT_FIELDS.lotNumber] ?? '').trim() || '-';
            const salePriceRaw = stock.fields[LOT_FIELDS.salePrice];
            const salePriceN = typeof salePriceRaw === 'number' ? salePriceRaw : Number(salePriceRaw);

            return (
              <div key={stock.id} className="py-3.5 border-b border-gray-100 last:border-0">
                {/* 1줄: 품목명 + 총중량 */}
                <div className="flex justify-between items-baseline gap-2">
                  <p className="font-bold text-[16px] text-gray-900 truncate">
                    {lotProductTitle(stock.fields)}
                  </p>
                  <p className="shrink-0 text-[15px] font-bold text-blue-600">
                    {stockKg.toLocaleString('ko-KR')} kg
                  </p>
                </div>
                {/* 2줄: LOT번호 */}
                <p className="text-[12px] font-mono text-gray-400 mt-0.5">{lotNo}</p>
                {/* 3줄: 규격/미수 + 판매원가 */}
                <div className="flex justify-between items-baseline mt-0.5">
                  <p className="text-[13px] text-gray-500">
                    규격 {specRaw || '-'} / 미수 {misuRaw || '-'}
                  </p>
                  <p className="shrink-0 text-[13px] text-gray-600">
                    {Number.isFinite(salePriceN) && salePriceN > 0
                      ? `${salePriceN.toLocaleString('ko-KR')}원`
                      : '—'}
                  </p>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-20 text-gray-400">조건에 맞는 재고가 없습니다.</div>
        )}
      </div>

      {/* 우측 슬라이드 팝업 필터 */}
      {isFilterOpen && (
        <div className="fixed inset-0 z-30 flex justify-end">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setIsFilterOpen(false)} />
          <div className="relative w-4/5 max-w-sm bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-6 border-b flex justify-between items-center">
              <h2 className="text-xl font-bold">상세 필터</h2>
              <button onClick={() => setIsFilterOpen(false)}><XMarkIcon className="w-6 h-6" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700">품명 검색</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="품목명 입력"
                    className="w-full p-4 bg-gray-100 rounded-xl border-none text-sm"
                    value={filters.searchTerm}
                    onChange={(e) => setFilters({...filters, searchTerm: e.target.value})}
                  />
                  <MagnifyingGlassIcon className="w-5 h-5 absolute right-4 top-4 text-gray-400" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700">기간 설정</label>
                <div className="flex gap-2 items-center text-xs">
                  <input type="date" className="flex-1 p-3 bg-gray-100 rounded-xl border-none" />
                  <span>~</span>
                  <input type="date" className="flex-1 p-3 bg-gray-100 rounded-xl border-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700">규격</label>
                  <input
                    type="text" placeholder="예: 11"
                    className="w-full p-4 bg-gray-100 rounded-xl border-none text-sm"
                    value={filters.spec}
                    onChange={(e) => setFilters({...filters, spec: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700">미수</label>
                  <input
                    type="text" placeholder="예: 42/44"
                    className="w-full p-4 bg-gray-100 rounded-xl border-none text-sm"
                    value={filters.count}
                    onChange={(e) => setFilters({...filters, count: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700">원산지</label>
                <select className="w-full p-4 bg-gray-100 rounded-xl border-none text-sm appearance-none">
                  <option>전체</option>
                  <option>국산</option>
                  <option>러시아</option>
                  <option>중국</option>
                </select>
              </div>
            </div>

            <div className="p-6 bg-gray-50 flex gap-3">
              <button onClick={resetFilters} className="flex-1 py-4 bg-white border border-gray-200 rounded-2xl font-bold text-gray-500">초기화</button>
              <button onClick={applyFilters} className="flex-[2] py-4 bg-blue-600 rounded-2xl font-bold text-white shadow-lg">적용하기</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
