'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  ChevronLeftIcon,
  MagnifyingGlassIcon,
  QrCodeIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { searchLotByKeyword, createOutboundRecord } from '@/app/actions';
import { formatIntKo, fromGroupedIntegerInput } from '@/lib/number-format';
import { readSession } from '@/lib/session';

// html5-qrcode는 window/document에 접근하므로 SSR에서 완전히 제외합니다.
const BarcodeScanner = dynamic(
  () => import('@/app/components/BarcodeScanner'),
  { ssr: false, loading: () => null },
);

type CartItem = {
  cartId: string;
  lotId: string;
  lotNumber: string;
  productName: string;
  spec: string;
  misu: string;
  origin: string;
  storage: string;
  quantity: number;
  seller: string;
  salePrice: number | undefined;
};

function formatMisuDisplay(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return '—';
  if (s.endsWith('미')) return s;
  return `${s} 미`;
}

export default function OutboundRecordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [now, setNow] = useState<Date | null>(null);
  const [workerId, setWorkerId] = useState('');

  const [searchMode, setSearchMode] = useState<'manual' | 'barcode'>('manual');
  // 카메라 뷰파인더 표시 여부 (바코드 스캔 성공 후 닫힘)
  const [scannerOpen, setScannerOpen] = useState(false);
  // null = 아직 감지 중, true/false = 결과
  const [hasCamera, setHasCamera] = useState<boolean | null>(null);

  const [keyword, setKeyword] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [searchResults, setSearchResults] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selectedLot, setSelectedLot] = useState<any | null>(null);
  const hasLoggedSelectedLotRef = useRef(false);

  const [quantity, setQuantity] = useState('');
  const [seller, setSeller] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [cart, setCart] = useState<CartItem[]>([]);

  // ── 초기화 ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const s = readSession();
    if (s) setWorkerId(s.workerId);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 카메라 지원 여부 감지 (모바일: true, PC: false)
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

  useEffect(() => {
    if (!selectedLot || hasLoggedSelectedLotRef.current) return;
    const rawStock = selectedLot?.fields?.['재고수량'];
    console.group('[outbound diagnostic] selectedLot snapshot');
    console.log('selectedLot:', selectedLot);
    console.log("fields['재고수량']:", rawStock, '→ Number:', Number(rawStock));
    console.groupEnd();
    hasLoggedSelectedLotRef.current = true;
  }, [selectedLot]);

  // ── 검색 공통 로직 ────────────────────────────────────────────────────────
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setIsSearching(true);
    setSelectedLot(null);
    hasLoggedSelectedLotRef.current = false;
    const result = await searchLotByKeyword(q);
    if (result.success) {
      if (result.records.length === 0) alert('일치하는 재고가 없습니다.');
      setSearchResults(result.records);
      // 결과가 1건이면 자동 선택 (바코드 스캔 시 즉시 입력 화면으로)
      if (result.records.length === 1) setSelectedLot(result.records[0]);
    } else {
      alert(`검색 실패: ${result.error}`);
    }
    setIsSearching(false);
  }, []);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!keyword.trim()) return alert('검색어를 입력해주세요.');
    await doSearch(keyword);
  };

  // ── URL ?lot= 파라미터 자동 검색 ─────────────────────────────────────────
  // 입고증 QR코드를 스캔하면 ?lot=LOT번호 파라미터와 함께 이 페이지가 열립니다.
  useEffect(() => {
    const lot = searchParams.get('lot');
    if (!lot) return;
    setKeyword(lot);
    doSearch(lot);
  // searchParams가 바뀌면 재실행하지 않도록 마운트 시 1회만 실행
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 바코드 감지 콜백 ─────────────────────────────────────────────────────
  const handleBarcodeDetected = useCallback(
    async (raw: string) => {
      // QR코드에 URL이 담긴 경우 ?lot= 파라미터를 추출합니다.
      let code = raw.trim();
      try {
        const url = new URL(code);
        const lotParam = url.searchParams.get('lot');
        if (lotParam) code = lotParam;
      } catch {
        // URL 형식이 아닌 경우 원본 값 그대로 사용
      }
      setScannerOpen(false);
      setKeyword(code);
      await doSearch(code);
    },
    [doSearch],
  );

  // ── 탭 전환 ──────────────────────────────────────────────────────────────
  const switchToManual = () => {
    setSearchMode('manual');
    setScannerOpen(false);
    resetForm();
  };

  const switchToBarcode = () => {
    setSearchMode('barcode');
    resetForm();
    // 카메라가 있으면 즉시 스캐너 열기
    if (hasCamera) setScannerOpen(true);
  };

  const resetForm = () => {
    setSelectedLot(null);
    setQuantity('');
    setSeller('');
    setSalePrice('');
    setKeyword('');
    setSearchResults([]);
    hasLoggedSelectedLotRef.current = false;
  };

  // ── 장바구니 추가 ─────────────────────────────────────────────────────────
  const handleAddToCart = () => {
    if (!selectedLot) return;
    const qty = fromGroupedIntegerInput(quantity).value;
    if (!Number.isFinite(qty) || qty <= 0) return alert('출고 수량을 입력해 주세요.');
    const currentStock = Number(selectedLot.fields['재고수량'] ?? 0);
    if (qty > currentStock) return alert('현재 재고보다 많습니다!');

    setCart((prev) => [
      ...prev,
      {
        cartId: `${selectedLot.id}-${Date.now()}`,
        lotId: selectedLot.id,
        lotNumber: selectedLot.fields['LOT번호'],
        productName: selectedLot.fields['품목명'],
        spec: selectedLot.fields['규격'],
        misu: selectedLot.fields['미수'] ?? selectedLot.fields['상세규격_표기'] ?? '',
        origin: selectedLot.fields['원산지'],
        storage: String(selectedLot.fields['보관처'] ?? ''),
        quantity: qty,
        seller: seller.trim(),
        salePrice: salePrice ? fromGroupedIntegerInput(salePrice).value : undefined,
      },
    ]);

    resetForm();
    // 바코드 모드면 스캐너 다시 열기
    if (searchMode === 'barcode' && hasCamera) setScannerOpen(true);
  };

  // ── 출고 신청 ─────────────────────────────────────────────────────────────
  const handleSubmitAll = async () => {
    if (cart.length === 0) return alert('출고할 항목이 없습니다.');
    setIsSubmitting(true);

    for (const item of cart) {
      const result = await createOutboundRecord({
        date: (now ?? new Date()).toISOString().split('T')[0],
        lotNumber: item.lotNumber,
        lotRecordId: item.lotId,
        quantity: item.quantity,
        workerRecordId: workerId,
        spec: item.spec,
        origin: item.origin,
        misu: item.misu,
        seller: item.seller || undefined,
        salePrice: item.salePrice,
      });

      if (!result.success) {
        setIsSubmitting(false);
        return alert(
          `출고 실패 (${item.lotNumber}): ${result.error}\n\n전체 신청이 취소되었습니다.`,
        );
      }
    }

    setIsSubmitting(false);
    alert('출고 신청이 완료되었습니다. 관리자 승인 후 재고가 차감됩니다.');
    router.push('/');
  };

  return (
    <main className="min-h-screen bg-gray-50 pb-32">
      {/* 헤더 */}
      <header className="bg-white px-4 py-4 flex justify-between items-center sticky top-0 z-20 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/')}
            className="p-2 -ml-2 active:scale-95 transition-transform"
          >
            <ChevronLeftIcon className="w-6 h-6 text-gray-800" />
          </button>
          <div className="flex items-baseline gap-2">
            <h1 className="text-[18px] font-black tracking-tight text-[#FF3B30]">물품 출고</h1>
            <span className="text-[13px] font-medium text-gray-500 whitespace-nowrap">
              어떤 물건이 출고되나요?
            </span>
          </div>
        </div>
        <div className="text-right leading-tight">
          <p className="text-[11px] text-gray-500 font-medium">
            {now
              ? now.toLocaleDateString('ko-KR', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })
              : ''}
          </p>
          <p className="text-[14px] font-bold text-gray-900">
            {now
              ? now.toLocaleTimeString('ko-KR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: false,
                })
              : ''}
          </p>
        </div>
      </header>

      <div className="p-4 space-y-4">
        {/* ── 검색 모드 탭 ──────────────────────────────────────────────── */}
        <div className="flex bg-gray-200 p-1 rounded-2xl">
          <button
            onClick={switchToManual}
            className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${
              searchMode === 'manual' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            <MagnifyingGlassIcon className="w-5 h-5" />
            직접 검색
          </button>
          <button
            onClick={switchToBarcode}
            className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${
              searchMode === 'barcode' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            <QrCodeIcon className="w-5 h-5" />
            QR 스캔
            {/* PC에서는 "(PC 미지원)" 표시 */}
            {hasCamera === false && (
              <span className="text-[10px] font-normal text-gray-400">(카메라 없음)</span>
            )}
          </button>
        </div>

        {/* ── 검색 · 선택 카드 ──────────────────────────────────────────── */}
        <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-gray-100 space-y-4">

          {/* ── 직접 검색 모드 ─────────────────────────────────────────── */}
          {searchMode === 'manual' && !selectedLot && (
            <form onSubmit={handleSearch} className="space-y-3">
              <label className="text-sm font-bold text-gray-400 ml-1">
                LOT 번호 검색 (뒷 4자리 또는 전체)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  autoFocus
                  placeholder="예: 0001"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="flex-1 min-w-0 p-4 bg-gray-50 border-none rounded-2xl text-xl font-black text-center"
                />
                <button
                  type="submit"
                  disabled={isSearching}
                  className="shrink-0 px-6 py-4 bg-gray-800 text-white rounded-2xl font-bold active:scale-95 transition-all"
                >
                  {isSearching ? '...' : '검색'}
                </button>
              </div>
            </form>
          )}

          {/* ── 바코드 스캔 모드 ───────────────────────────────────────── */}
          {searchMode === 'barcode' && !selectedLot && (
            <div className="space-y-3">
              {/* PC: 카메라 없음 안내 */}
              {hasCamera === false && (
                <div className="px-4 py-5 bg-gray-50 rounded-2xl text-center space-y-1">
                  <p className="text-2xl">📵</p>
                  <p className="text-sm font-bold text-gray-600">
                    이 기기에서는 카메라를 사용할 수 없습니다.
                  </p>
                  <p className="text-xs text-gray-400">
                    모바일에서 접속하거나 아래 입력창에 직접 입력하세요.
                  </p>
                </div>
              )}

              {/* 카메라 뷰파인더 (모바일 & scannerOpen) */}
              {hasCamera && scannerOpen && (
                <BarcodeScanner onDetected={handleBarcodeDetected} />
              )}

              {/* 스캔 완료 후 / 카메라 대기 중 → 다시 스캔 버튼 */}
              {hasCamera && !scannerOpen && !isSearching && (
                <button
                  onClick={() => {
                    setKeyword('');
                    setSearchResults([]);
                    setScannerOpen(true);
                  }}
                  className="w-full py-4 rounded-2xl bg-blue-600 text-white text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition-all"
                >
                  <QrCodeIcon className="w-5 h-5" />
                  다시 스캔하기
                </button>
              )}

              {/* 검색 중 스피너 */}
              {isSearching && (
                <div className="py-4 text-center">
                  <p className="text-sm font-bold text-gray-500 animate-pulse">검색 중...</p>
                </div>
              )}

              {/* 스캔 결과 or 직접 입력 fallback */}
              <form onSubmit={handleSearch} className="flex gap-2">
                <input
                  type="text"
                  placeholder={scannerOpen ? '스캔 대기중...' : '스캔 결과 또는 직접 입력'}
                  value={keyword}
                  readOnly={scannerOpen}
                  onChange={(e) => setKeyword(e.target.value)}
                  className={`flex-1 min-w-0 p-4 bg-gray-50 border-none rounded-2xl text-xl font-black text-center transition-opacity ${
                    scannerOpen ? 'opacity-40 cursor-not-allowed' : ''
                  }`}
                />
                {!scannerOpen && (
                  <button
                    type="submit"
                    disabled={isSearching || !keyword.trim()}
                    className="shrink-0 px-6 py-4 bg-gray-800 text-white rounded-2xl font-bold disabled:opacity-40 active:scale-95 transition-all"
                  >
                    검색
                  </button>
                )}
              </form>
            </div>
          )}

          {/* ── 검색 결과 리스트 ─────────────────────────────────────────── */}
          {!selectedLot && searchResults.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-gray-400 ml-1">
                출고할 상품을 선택하세요 ({searchResults.length}건)
              </p>
              {searchResults.map((lot) => (
                <button
                  key={lot.id}
                  onClick={() => setSelectedLot(lot)}
                  className="w-full text-left p-4 rounded-2xl border border-blue-100 bg-blue-50 active:scale-95 transition-all"
                >
                  <p className="text-xs text-blue-500 font-bold mb-1">{lot.fields['LOT번호']}</p>
                  <div className="flex justify-between items-center">
                    <p className="font-black text-lg text-gray-800">
                      {lot.fields['품목명']}{' '}
                      <span className="text-sm text-gray-500 font-normal">
                        (규격 {lot.fields['규격']}kg /{' '}
                        {formatMisuDisplay(lot.fields['미수'] ?? lot.fields['상세규격_표기'])})
                      </span>
                    </p>
                    <p className="text-sm font-bold text-gray-500">
                      재고:{' '}
                      <span className="text-blue-600">
                        {formatIntKo(Math.trunc(Number(lot.fields['재고수량'] ?? 0)))}
                      </span>
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* ── LOT 선택 후: 수량 · 판매처 · 금액 입력 ──────────────────── */}
          {selectedLot && (
            <div className="space-y-5">
              <div className="flex items-start justify-between">
                <div>
                  <span className="inline-block px-2 py-1 bg-red-100 text-red-600 text-[10px] font-black rounded-md mb-2">
                    선택된 상품
                  </span>
                  <p className="font-black text-xl text-gray-800">
                    {selectedLot.fields['품목명']}{' '}
                    <span className="text-base text-gray-500 font-normal">
                      (규격 {selectedLot.fields['규격']}kg /{' '}
                      {formatMisuDisplay(
                        selectedLot.fields['미수'] ?? selectedLot.fields['상세규격_표기'],
                      )}
                      )
                    </span>
                  </p>
                  <p className="text-xs text-gray-400 mt-1">{selectedLot.fields['LOT번호']}</p>
                </div>
                <button onClick={resetForm} className="text-xs text-gray-400 underline p-2">
                  다시 검색
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-400 ml-1">현재 남은 재고</label>
                  <div className="w-full p-4 bg-gray-50 rounded-2xl text-base font-bold text-blue-600 text-left">
                    {formatIntKo(Math.trunc(Number(selectedLot.fields['재고수량'] ?? 0)))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-400 ml-1">출고할 수량</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="예: 100"
                    value={quantity}
                    autoFocus
                    onChange={(e) => {
                      const { display } = fromGroupedIntegerInput(e.target.value);
                      setQuantity(display);
                    }}
                    className="w-full p-4 bg-gray-50 border-none rounded-2xl text-base font-bold text-red-600 focus:ring-2 focus:ring-red-500 text-left"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-400 ml-1">보관처</label>
                <div className="w-full p-4 bg-gray-50 rounded-2xl text-base font-bold text-gray-700 text-left">
                  {String(selectedLot.fields['보관처'] ?? '').trim() || '—'}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-400 ml-1">판매처</label>
                  <input
                    type="text"
                    placeholder="직접입력"
                    value={seller}
                    onChange={(e) => setSeller(e.target.value)}
                    className="w-full p-4 bg-gray-50 border-none rounded-2xl text-base font-bold text-gray-800 text-left"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-400 ml-1">판매 금액</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="예: 50,000"
                    value={salePrice}
                    onChange={(e) => {
                      const { display } = fromGroupedIntegerInput(e.target.value);
                      setSalePrice(display);
                    }}
                    className="w-full p-4 bg-gray-50 border-none rounded-2xl text-base font-bold text-gray-800 text-left"
                  />
                </div>
              </div>

              <button
                onClick={handleAddToCart}
                className="w-full py-5 rounded-2xl bg-gray-800 text-white text-lg font-black active:scale-95 transition-all"
              >
                + 출고 목록에 추가
              </button>
            </div>
          )}
        </div>

        {/* ── 장바구니 리스트 ──────────────────────────────────────────────── */}
        {cart.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-bold text-gray-400 ml-1">
              출고 목록 ({cart.length}건)
            </p>
            <div className="grid grid-cols-2 gap-3">
              {cart.map((item) => (
                <div
                  key={item.cartId}
                  className="flex min-h-0 min-w-0 items-stretch gap-2 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-bold text-gray-400">{item.lotNumber}</p>
                    <p className="truncate font-black text-base text-gray-800">
                      {item.productName}{' '}
                      <span className="text-sm font-normal text-gray-500">
                        (규격 {item.spec}kg / {formatMisuDisplay(item.misu)})
                      </span>
                    </p>
                    <div className="mt-1 flex flex-wrap gap-3">
                      <span className="text-sm font-bold text-red-600">
                        {formatIntKo(item.quantity)}박스
                      </span>
                      {item.seller && (
                        <span className="text-sm text-gray-500">{item.seller}</span>
                      )}
                      {item.salePrice != null && (
                        <span className="text-sm text-gray-500">
                          {formatIntKo(item.salePrice)}원
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        setCart((prev) => prev.filter((c) => c.cartId !== item.cartId))
                      }
                      className="p-2 text-gray-900 hover:text-red-600 active:scale-90 transition-all"
                      aria-label="목록에서 삭제"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── 출고 신청 버튼 (장바구니 1건 이상) ─────────────────────────────── */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gray-50 border-t border-gray-100">
          <button
            onClick={handleSubmitAll}
            disabled={isSubmitting}
            className={`w-full py-5 rounded-2xl text-xl font-black text-white shadow-lg transition-all ${
              isSubmitting ? 'bg-red-300 cursor-not-allowed' : 'bg-red-600 active:scale-95'
            }`}
          >
            {isSubmitting ? '신청 중...' : `출고 신청 (${cart.length}건)`}
          </button>
        </div>
      )}
    </main>
  );
}
