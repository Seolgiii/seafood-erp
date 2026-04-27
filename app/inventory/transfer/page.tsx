'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import PageHeader from '@/components/PageHeader';
import { searchTransferLot, createTransferRecord, getStorageOptions } from '@/app/actions';
import type { TransferLotResult } from '@/app/actions/inventory/transfer';
import { readSession } from '@/lib/session';

function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function TransferPage() {
  const router = useRouter();
  const [workerId, setWorkerId] = useState('');

  // LOT 검색
  const [keyword, setKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<TransferLotResult[]>([]);
  const [selectedLot, setSelectedLot] = useState<TransferLotResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // 이동 후 보관처 드롭다운
  const [storageOptions, setStorageOptions] = useState<{ id: string; name: string }[]>([]);
  const [storageQuery, setStorageQuery] = useState('');
  const [storageOpen, setStorageOpen] = useState(false);
  const [targetStorageId, setTargetStorageId] = useState('');
  const storageRef = useRef<HTMLDivElement>(null);

  // 이동 정보
  const [transferQty, setTransferQty] = useState('');
  const [transferDate, setTransferDate] = useState(todayKST());
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const s = readSession();
    if (s) setWorkerId(s.workerId);
  }, []);

  useEffect(() => {
    getStorageOptions()
      .then(setStorageOptions)
      .catch((e) => console.error('[보관처옵션 오류]', e));
  }, []);

  // 드롭다운 바깥 클릭 시 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (storageRef.current && !storageRef.current.contains(e.target as Node)) {
        setStorageOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSearch = async () => {
    if (!keyword.trim()) return;
    setIsSearching(true);
    setSelectedLot(null);
    setSearchResults([]);
    try {
      const res = await searchTransferLot(keyword);
      if (res.success) {
        setSearchResults(res.records);
      } else {
        alert(res.error ?? '검색 중 오류가 발생했습니다.');
      }
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelect = (lot: TransferLotResult) => {
    setSelectedLot(lot);
    setSearchResults([]);
    setTransferQty('');
  };

  const filteredStorage = storageOptions.filter((o) => o.name.includes(storageQuery));

  const handleSubmit = async () => {
    if (!selectedLot) return alert('이동할 LOT를 선택해주세요.');
    const qty = Number(transferQty.replace(/,/g, ''));
    if (!qty || qty <= 0) return alert('이동 수량을 올바르게 입력해주세요.');
    if (qty > selectedLot.stockQty) return alert(`재고 부족 (현재: ${selectedLot.stockQty}박스)`);
    if (!targetStorageId) return alert('이동 후 보관처를 선택해주세요.');
    if (!transferDate) return alert('이동일을 입력해주세요.');
    if (!workerId) return alert('로그인 정보를 확인해주세요.');

    setIsSubmitting(true);
    try {
      const result = await createTransferRecord({
        lotRecordId: selectedLot.lotRecordId,
        이동수량: qty,
        이동후보관처RecordId: targetStorageId,
        이동일: transferDate,
        workerId,
      });
      if (result.success) {
        alert('재고 이동 신청이 완료되었습니다.');
        router.push('/');
      } else {
        alert(`신청 실패: ${result.message}`);
      }
    } catch {
      alert('처리 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F2F4F6] flex flex-col pb-10 font-['Spoqa_Han_Sans_Neo']">
      <PageHeader
        title="재고 이동"
        subtitle="보관처 간 재고를 이동합니다"
        onBack={() => router.push('/')}
        titleClassName="text-[#FF8C00] font-black"
      />

      <main className="p-5 flex flex-col gap-5">

        {/* LOT 검색 */}
        <div className="bg-white p-6 rounded-[28px] shadow-[0_8px_24px_rgba(149,157,165,0.08)] flex flex-col gap-4">
          <h2 className="text-[15px] font-bold text-gray-700">① 이동할 LOT 선택</h2>

          <div className="flex gap-2">
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="LOT 일련번호 또는 품목명 검색"
              className="flex-1 bg-gray-100 text-gray-900 text-[15px] font-bold rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#FF8C00] transition-all"
            />
            <button
              onClick={handleSearch}
              disabled={isSearching}
              className="bg-[#FF8C00] text-white px-4 py-3 rounded-2xl active:scale-95 transition-transform disabled:opacity-50"
            >
              <MagnifyingGlassIcon className="w-5 h-5" />
            </button>
          </div>

          {isSearching && (
            <p className="text-center text-[13px] text-gray-400 font-medium animate-pulse">검색 중...</p>
          )}

          {searchResults.length > 0 && (
            <ul className="flex flex-col gap-2 max-h-64 overflow-y-auto">
              {searchResults.map((lot) => (
                <li key={lot.lotRecordId}>
                  <button
                    onClick={() => handleSelect(lot)}
                    className="w-full text-left bg-gray-50 hover:bg-orange-50 active:bg-orange-100 rounded-2xl px-4 py-3 flex flex-col gap-1 transition-colors"
                  >
                    <span className="text-[13px] font-black font-mono text-[#FF8C00] tracking-tight">{lot.lotNumber}</span>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-bold text-gray-700">{lot.productName || '-'}</span>
                      {lot.spec && <span className="text-[12px] text-gray-400">규격: {lot.spec}</span>}
                      {lot.misu && <span className="text-[12px] text-gray-400">미수: {lot.misu}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[12px] font-bold text-blue-600">잔여 {lot.stockQty}박스</span>
                      {lot.storage && <span className="text-[12px] text-gray-400">{lot.storage}</span>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {searchResults.length === 0 && !isSearching && keyword && !selectedLot && (
            <p className="text-center text-[13px] text-gray-400 font-medium">검색 결과가 없습니다</p>
          )}

          {/* 선택된 LOT 표시 */}
          {selectedLot && (
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold text-orange-600">선택된 LOT</span>
                <button
                  onClick={() => setSelectedLot(null)}
                  className="text-[12px] text-gray-400 font-medium underline"
                >
                  변경
                </button>
              </div>
              <p className="text-[14px] font-black font-mono text-[#FF8C00] tracking-tight">{selectedLot.lotNumber}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[13px] font-bold text-gray-800">{selectedLot.productName || '-'}</span>
                {selectedLot.spec && <span className="text-[12px] text-gray-500">규격: {selectedLot.spec}</span>}
                {selectedLot.misu && <span className="text-[12px] text-gray-500">미수: {selectedLot.misu}</span>}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[13px] font-bold text-blue-600">현재 재고: {selectedLot.stockQty}박스</span>
                {selectedLot.storage && (
                  <span className="text-[12px] text-gray-500">현재 보관처: {selectedLot.storage}</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 이동 정보 입력 */}
        {selectedLot && (
          <div className="bg-white p-6 rounded-[28px] shadow-[0_8px_24px_rgba(149,157,165,0.08)] flex flex-col gap-5">
            <h2 className="text-[15px] font-bold text-gray-700">② 이동 정보 입력</h2>

            {/* 이동수량 */}
            <div className="flex flex-col gap-2">
              <label className="text-[14px] font-bold text-gray-500 ml-1">
                이동 수량 (박스) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                inputMode="numeric"
                value={transferQty}
                onChange={(e) => setTransferQty(e.target.value)}
                placeholder={`최대 ${selectedLot.stockQty}박스`}
                min={1}
                max={selectedLot.stockQty}
                className="bg-gray-100 text-gray-900 text-[15px] font-bold rounded-2xl p-4 outline-none focus:ring-2 focus:ring-[#FF8C00] transition-all"
              />
            </div>

            {/* 이동 후 보관처 */}
            <div className="flex flex-col gap-2" ref={storageRef}>
              <label className="text-[14px] font-bold text-gray-500 ml-1">
                이동 후 보관처 <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={storageQuery}
                  onChange={(e) => {
                    setStorageQuery(e.target.value);
                    setTargetStorageId('');
                    setStorageOpen(true);
                  }}
                  onFocus={() => setStorageOpen(true)}
                  placeholder="보관처 검색 또는 선택"
                  className="w-full bg-gray-100 text-gray-900 text-[15px] font-bold rounded-2xl p-4 outline-none focus:ring-2 focus:ring-[#FF8C00] transition-all"
                />
                {storageOpen && filteredStorage.length > 0 && (
                  <ul className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-2xl shadow-lg max-h-48 overflow-y-auto">
                    {filteredStorage.map((opt) => (
                      <li
                        key={opt.id}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setStorageQuery(opt.name);
                          setTargetStorageId(opt.id);
                          setStorageOpen(false);
                        }}
                        className="px-4 py-3 text-[14px] font-bold text-gray-800 hover:bg-orange-50 cursor-pointer first:rounded-t-2xl last:rounded-b-2xl"
                      >
                        {opt.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* 이동일 */}
            <div className="flex flex-col gap-2">
              <label className="text-[14px] font-bold text-gray-500 ml-1">
                이동일 <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
                className="bg-gray-100 text-gray-900 text-[15px] font-bold rounded-2xl p-4 outline-none focus:ring-2 focus:ring-[#FF8C00] transition-all"
              />
            </div>

            {/* 이동 요약 */}
            {transferQty && targetStorageId && (
              <div className="bg-gray-50 rounded-2xl p-4 flex flex-col gap-1">
                <p className="text-[13px] font-bold text-gray-500">이동 요약</p>
                <p className="text-[14px] font-bold text-gray-800">
                  {selectedLot.storage || '현재 보관처'} → {storageQuery}
                </p>
                <p className="text-[14px] font-bold text-blue-600">
                  {transferQty}박스 이동
                </p>
              </div>
            )}
          </div>
        )}

        {/* 제출 버튼 */}
        {selectedLot && (
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full bg-[#FF8C00] text-white font-black text-[16px] py-4 rounded-[20px] shadow-[0_4px_16px_rgba(255,140,0,0.3)] active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {isSubmitting ? '신청 중...' : '재고 이동 신청'}
          </button>
        )}
      </main>
    </div>
  );
}
