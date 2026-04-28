'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { MagnifyingGlassIcon, QrCodeIcon, TrashIcon } from '@heroicons/react/24/outline';
import PageHeader from '@/components/PageHeader';
import { searchTransferLot, createTransferRecord, getStorageOptions } from '@/app/actions';
import type { TransferLotResult } from '@/app/actions/inventory/transfer';
import { readSession } from '@/lib/session';
import { toast } from '@/lib/toast';

const BarcodeScanner = dynamic(
  () => import('@/app/components/BarcodeScanner'),
  { ssr: false, loading: () => null },
);

function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

type CartItem = {
  cartId: string;
  lotRecordId: string;
  lotNumber: string;
  productName: string;
  spec: string;
  misu: string;
  stockQty: number;
  currentStorage: string;
  transferQty: number;
  targetStorageId: string;
  targetStorageName: string;
  transferDate: string;
};

export default function TransferPage() {
  const router = useRouter();
  const [workerId, setWorkerId] = useState('');
  const [storageOptions, setStorageOptions] = useState<{ id: string; name: string }[]>([]);

  // QR 스캐너
  const [scannerOpen, setScannerOpen] = useState(false);
  const [hasCamera, setHasCamera] = useState<boolean | null>(null);

  // LOT 검색
  const [keyword, setKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<TransferLotResult[]>([]);
  const [selectedLot, setSelectedLot] = useState<TransferLotResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // 현재 입력 중인 이동 정보
  const [transferQty, setTransferQty] = useState('');
  const [storageQuery, setStorageQuery] = useState('');
  const [storageOpen, setStorageOpen] = useState(false);
  const [targetStorageId, setTargetStorageId] = useState('');
  const [targetStorageName, setTargetStorageName] = useState('');
  const [transferDate, setTransferDate] = useState(todayKST());
  const storageRef = useRef<HTMLDivElement>(null);

  // 장바구니
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const s = readSession();
    if (s) setWorkerId(s.workerId);
  }, []);

  useEffect(() => {
    getStorageOptions()
      .then(setStorageOptions)
      .catch(() => {});
  }, []);

  // 재고 조회 → 재고 이동 Phase 2: sessionStorage draft 자동 선택
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('sea_transfer_draft');
      if (!raw) return;
      sessionStorage.removeItem('sea_transfer_draft');
      const d = JSON.parse(raw) as {
        lotId: string; lotNumber: string; productName: string;
        spec: string; misu: string; stockQty: number;
      };
      setSelectedLot({
        lotRecordId: d.lotId,
        lotNumber: d.lotNumber,
        productName: d.productName,
        spec: d.spec,
        misu: d.misu,
        stockQty: d.stockQty,
        storage: '',
        inboundRecordId: '',
      });
    } catch {}
  }, []);

  // 카메라 지원 여부 감지
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      setHasCamera(false);
      return;
    }
    navigator.mediaDevices
      .enumerateDevices()
      .then((devices) => setHasCamera(devices.some((d) => d.kind === 'videoinput')))
      .catch(() => setHasCamera(false));
  }, []);

  // 보관처 드롭다운 바깥 클릭 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (storageRef.current && !storageRef.current.contains(e.target as Node)) {
        setStorageOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setIsSearching(true);
    setSelectedLot(null);
    setSearchResults([]);
    try {
      const res = await searchTransferLot(q);
      if (res.success) {
        if (res.records.length === 0) {
          toast('일치하는 재고가 없습니다.', 'info');
        } else if (res.records.length === 1) {
          setSelectedLot(res.records[0]);
          setScannerOpen(false);
        } else {
          setSearchResults(res.records);
          setScannerOpen(false);
        }
      } else {
        toast(res.error ?? '검색 중 오류가 발생했습니다.');
      }
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleSearch = () => doSearch(keyword);

  const handleBarcodeDetected = useCallback(async (raw: string) => {
    let code = raw.trim();
    try {
      const url = new URL(code);
      const lotParam = url.searchParams.get('lot');
      if (lotParam) code = lotParam;
    } catch {}
    setKeyword(code);
    await doSearch(code);
  }, [doSearch]);

  const handleSelect = (lot: TransferLotResult) => {
    setSelectedLot(lot);
    setSearchResults([]);
    setTransferQty('');
  };

  const resetForm = () => {
    setSelectedLot(null);
    setTransferQty('');
    setStorageQuery('');
    setTargetStorageId('');
    setTargetStorageName('');
    setKeyword('');
    setSearchResults([]);
    setScannerOpen(false);
  };

  const filteredStorage = storageOptions.filter((o) => o.name.includes(storageQuery));

  const handleAddToCart = () => {
    if (!selectedLot) return;
    const qty = Number(transferQty.replace(/,/g, ''));
    if (!qty || qty <= 0) { toast('이동 수량을 올바르게 입력해주세요.'); return; }
    if (qty > selectedLot.stockQty) { toast(`재고 부족 (현재: ${selectedLot.stockQty}박스)`); return; }
    if (!targetStorageId) { toast('이동 후 보관처를 선택해주세요.'); return; }
    if (!transferDate) { toast('이동일을 입력해주세요.'); return; }

    setCart((prev) => [
      ...prev,
      {
        cartId: `${selectedLot.lotRecordId}-${Date.now()}`,
        lotRecordId: selectedLot.lotRecordId,
        lotNumber: selectedLot.lotNumber,
        productName: selectedLot.productName,
        spec: selectedLot.spec,
        misu: selectedLot.misu,
        stockQty: selectedLot.stockQty,
        currentStorage: selectedLot.storage,
        transferQty: qty,
        targetStorageId,
        targetStorageName,
        transferDate,
      },
    ]);

    setSelectedLot(null);
    setTransferQty('');
    setStorageQuery('');
    setTargetStorageId('');
    setTargetStorageName('');
    setKeyword('');
    setSearchResults([]);
  };

  const handleSubmitAll = async () => {
    if (cart.length === 0) return;
    if (!workerId) { toast('로그인 정보를 확인해주세요.'); return; }
    setIsSubmitting(true);

    for (const item of cart) {
      const result = await createTransferRecord({
        lotRecordId: item.lotRecordId,
        이동수량: item.transferQty,
        이동후보관처RecordId: item.targetStorageId,
        이동일: item.transferDate,
        workerId,
      });

      if (!result.success) {
        setIsSubmitting(false);
        toast(`이동 신청 실패 (${item.lotNumber}): ${result.message}`);
        return;
      }
    }

    setIsSubmitting(false);
    toast('재고 이동 신청이 완료되었습니다.', 'success');
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-[#F2F4F6] flex flex-col pb-32 font-['Spoqa_Han_Sans_Neo']">
      <PageHeader
        title="재고 이동"
        subtitle="보관처 간 재고를 이동합니다"
        onBack={() => router.push('/')}
        titleClassName="text-[#FF8C00] font-black"
      />

      <main className="p-4 flex flex-col gap-4">

        {/* LOT 검색 + 이동 정보 카드 */}
        <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-gray-100 space-y-4">

          {/* LOT 검색 입력 */}
          {!selectedLot && (
            <div className="space-y-3">
              {!scannerOpen && (
                <label className="text-[13px] font-bold text-gray-500 ml-1">
                  LOT 일련번호 또는 품목명
                </label>
              )}
              {scannerOpen && hasCamera && <BarcodeScanner onDetected={handleBarcodeDetected} />}
              {scannerOpen && isSearching && (
                <p className="text-[13px] font-bold text-gray-500 animate-pulse text-center py-2">
                  검색 중...
                </p>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder={scannerOpen ? '스캔 결과 또는 직접 입력' : '예: 사료, 0001'}
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="flex-1 min-w-0 bg-gray-100 text-gray-900 text-[15px] font-bold rounded-2xl px-4 py-3.5 outline-none focus:ring-2 focus:ring-[#FF8C00] transition-all"
                />
                <button
                  onClick={handleSearch}
                  disabled={isSearching}
                  className="shrink-0 bg-[#FF8C00] text-white px-5 rounded-2xl active:scale-95 transition-transform disabled:opacity-50"
                >
                  {isSearching
                    ? <span className="text-[13px] font-bold px-1">...</span>
                    : <MagnifyingGlassIcon className="w-5 h-5" />
                  }
                </button>
                {hasCamera !== false && (
                  <button
                    onClick={() => setScannerOpen((v) => !v)}
                    className={`shrink-0 w-12 rounded-2xl flex items-center justify-center active:scale-95 transition-all ${
                      scannerOpen ? 'bg-[#FF8C00] text-white' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    <QrCodeIcon className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 검색 결과 리스트 */}
          {!selectedLot && searchResults.length > 0 && (
            <div className="space-y-2">
              <p className="text-[12px] font-bold text-gray-400 ml-1">
                이동할 LOT를 선택하세요 ({searchResults.length}건)
              </p>
              {searchResults.map((lot) => (
                <button
                  key={lot.lotRecordId}
                  onClick={() => handleSelect(lot)}
                  className="w-full text-left p-4 rounded-2xl border border-orange-100 bg-orange-50 active:scale-95 transition-all"
                >
                  <p className="font-mono text-[12px] font-black text-[#FF8C00] mb-1 tracking-tight">
                    {lot.lotNumber}
                  </p>
                  <div className="flex items-center justify-between">
                    <p className="text-[15px] font-black text-gray-800">{lot.productName || '—'}</p>
                    <p className="text-[13px] font-bold text-blue-600">{lot.stockQty}박스</p>
                  </div>
                  {(lot.spec || lot.misu) && (
                    <p className="text-[12px] text-gray-400 mt-0.5">
                      {lot.spec && `규격 ${lot.spec}kg`}
                      {lot.spec && lot.misu && ' · '}
                      {lot.misu && `${lot.misu}미`}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* 선택된 LOT + 이동 정보 입력 */}
          {selectedLot && (
            <div className="space-y-5">
              <div className="flex items-start justify-between">
                <div>
                  <span className="inline-block px-2 py-1 bg-orange-100 text-[#FF8C00] text-[11px] font-black rounded-md mb-2">
                    선택된 LOT
                  </span>
                  <p className="text-[15px] font-black text-gray-800">{selectedLot.productName || '—'}</p>
                  <p className="font-mono text-[12px] font-black text-[#FF8C00] tracking-tight mt-0.5">
                    {selectedLot.lotNumber}
                  </p>
                  {(selectedLot.spec || selectedLot.misu) && (
                    <p className="text-[12px] text-gray-400 mt-0.5">
                      {selectedLot.spec && `규격 ${selectedLot.spec}kg`}
                      {selectedLot.spec && selectedLot.misu && ' · '}
                      {selectedLot.misu && `${selectedLot.misu}미`}
                    </p>
                  )}
                </div>
                <button onClick={resetForm} className="text-[12px] text-gray-400 underline p-2 shrink-0">
                  다시 검색
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-[13px] font-bold text-gray-500 ml-1">현재 재고</label>
                  <div className="w-full bg-gray-100 rounded-2xl px-4 py-3.5 text-[15px] font-bold text-blue-600">
                    {selectedLot.stockQty}박스
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[13px] font-bold text-gray-500 ml-1">
                    이동 수량 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    autoFocus
                    value={transferQty}
                    onChange={(e) => setTransferQty(e.target.value)}
                    placeholder={`최대 ${selectedLot.stockQty}`}
                    min={1}
                    max={selectedLot.stockQty}
                    className="w-full bg-gray-100 text-gray-900 text-[15px] font-bold rounded-2xl px-4 py-3.5 outline-none focus:ring-2 focus:ring-[#FF8C00] transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2" ref={storageRef}>
                <label className="text-[13px] font-bold text-gray-500 ml-1">
                  이동 후 보관처 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={storageQuery}
                    onChange={(e) => {
                      setStorageQuery(e.target.value);
                      setTargetStorageId('');
                      setTargetStorageName('');
                      setStorageOpen(true);
                    }}
                    onFocus={() => setStorageOpen(true)}
                    placeholder="보관처 검색 또는 선택"
                    className="w-full bg-gray-100 text-gray-900 text-[15px] font-bold rounded-2xl px-4 py-3.5 outline-none focus:ring-2 focus:ring-[#FF8C00] transition-all"
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
                            setTargetStorageName(opt.name);
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

              <div className="space-y-2 overflow-hidden">
                <label className="text-[13px] font-bold text-gray-500 ml-1">
                  이동일 <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={transferDate}
                  onChange={(e) => setTransferDate(e.target.value)}
                  className="w-full max-w-full bg-gray-100 text-gray-900 text-[14px] font-bold rounded-2xl px-4 py-3.5 outline-none focus:ring-2 focus:ring-[#FF8C00] transition-all"
                />
              </div>

              <button
                onClick={handleAddToCart}
                className="w-full py-4 rounded-2xl bg-gray-800 text-white text-[16px] font-black active:scale-95 transition-all"
              >
                + 이동 목록에 추가
              </button>
            </div>
          )}
        </div>

        {/* 이동 목록 (장바구니) */}
        {cart.length > 0 && (
          <div className="space-y-3">
            <p className="text-[12px] font-bold text-gray-400 ml-1">
              이동 목록 ({cart.length}건)
            </p>
            <div className="grid grid-cols-2 gap-3">
              {cart.map((item) => (
                <div
                  key={item.cartId}
                  className="flex min-h-0 min-w-0 items-stretch gap-2 bg-white rounded-2xl border border-gray-100 p-3 shadow-sm"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-[11px] font-bold text-gray-400 truncate">
                      {item.lotNumber}
                    </p>
                    <p className="text-[14px] font-black text-gray-800 mt-0.5 truncate">
                      {item.productName}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <span className="text-[13px] font-bold text-[#FF8C00]">
                        {item.transferQty}박스
                      </span>
                      <span className="text-[12px] text-gray-400 truncate">→ {item.targetStorageName}</span>
                      <span className="text-[12px] text-gray-400">{item.transferDate}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center justify-end">
                    <button
                      onClick={() => setCart((prev) => prev.filter((c) => c.cartId !== item.cartId))}
                      className="p-2 text-gray-300 hover:text-red-500 active:scale-90 transition-all"
                      aria-label="목록에서 삭제"
                    >
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#F2F4F6] border-t border-gray-200">
          <button
            onClick={handleSubmitAll}
            disabled={isSubmitting}
            className={`w-full py-5 rounded-2xl text-[18px] font-black text-white shadow-lg transition-all ${
              isSubmitting
                ? 'bg-orange-300 cursor-not-allowed'
                : 'bg-[#FF8C00] active:scale-[0.98]'
            }`}
          >
            {isSubmitting ? '신청 중...' : `이동 신청 (${cart.length}건)`}
          </button>
        </div>
      )}
    </div>
  );
}
