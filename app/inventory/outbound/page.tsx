'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  MagnifyingGlassIcon,
  QrCodeIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import PageHeader from '@/components/PageHeader';
import { searchLotByKeyword, createOutboundRecord } from '@/app/actions';
import { formatIntKo, fromGroupedIntegerInput } from '@/lib/number-format';
import { readSession } from '@/lib/session';
import { toast } from '@/lib/toast';

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
  const [workerId, setWorkerId] = useState('');

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
  const [draftBanner, setDraftBanner] = useState(0); // 재고 조회에서 불러온 LOT 수

  // ── 초기화 ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const s = readSession();
    if (s) setWorkerId(s.workerId);
  }, []);

  // 재고 조회 → 출고 Phase 2: sessionStorage draft 자동 적재
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('sea_outbound_draft');
      if (!raw) return;
      sessionStorage.removeItem('sea_outbound_draft');
      const draft = JSON.parse(raw) as Array<{
        lotId: string; lotNumber: string; productName: string;
        spec: string; misu: string; stockQty: number; selectedBoxes: number;
      }>;
      if (!Array.isArray(draft) || draft.length === 0) return;
      const items: CartItem[] = draft.map((d, i) => ({
        cartId: `draft-${d.lotId}-${i}`,
        lotId: d.lotId,
        lotNumber: d.lotNumber,
        productName: d.productName,
        spec: d.spec,
        misu: d.misu,
        origin: '',
        storage: '',
        quantity: d.selectedBoxes,
        seller: '',
        salePrice: undefined,
      }));
      setCart(items);
      setDraftBanner(items.length);
    } catch {}
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
      if (result.records.length === 0) toast('일치하는 재고가 없습니다.', 'info');
      setSearchResults(result.records);
      if (result.records.length === 1) setSelectedLot(result.records[0]);
    } else {
      toast(`검색 실패: ${result.error}`);
    }
    setIsSearching(false);
  }, []);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!keyword.trim()) { toast('검색어를 입력해주세요.'); return; }
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
    if (!Number.isFinite(qty) || qty <= 0) { toast('출고 수량을 입력해 주세요.'); return; }
    const currentStock = Number(selectedLot.fields['재고수량'] ?? 0);
    if (qty > currentStock) { toast('현재 재고보다 많습니다!'); return; }

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

    // 검색결과·키워드 유지, 입력값만 초기화 → 같은 리스트에서 다음 LOT 선택
    setSelectedLot(null);
    setQuantity('');
    setSeller('');
    setSalePrice('');
    hasLoggedSelectedLotRef.current = false;
  };

  // ── 출고 신청 ─────────────────────────────────────────────────────────────
  const handleSubmitAll = async () => {
    if (cart.length === 0) return;
    setIsSubmitting(true);

    for (const item of cart) {
      const result = await createOutboundRecord({
        date: new Date().toISOString().split('T')[0],
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
        toast(`출고 실패 (${item.lotNumber}): ${result.error}`);
        return;
      }
    }

    setIsSubmitting(false);
    toast('출고 신청이 완료되었습니다. 관리자 승인 후 재고가 차감됩니다.', 'success');
    router.push('/');
  };

  return (
    <main className="min-h-screen bg-[#F2F4F6] pb-32 font-['Spoqa_Han_Sans_Neo']">
      {/* 헤더 */}
      <PageHeader
        title="물품 출고"
        subtitle="어떤 물건이 출고되나요?"
        onBack={() => router.push('/')}
        titleClassName="text-[#FF3B30] font-black"
      />

      {/* 재고 조회 연동 배너 */}
      {draftBanner > 0 && (
        <div className="mx-4 mt-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-2xl flex items-center justify-between gap-3">
          <p className="text-[13px] font-bold text-blue-700">
            재고 조회에서 {draftBanner}개 LOT를 불러왔습니다.
            <span className="block text-[11px] font-normal text-blue-500 mt-0.5">
              판매처·금액 입력 후 출고 신청하세요
            </span>
          </p>
          <button onClick={() => setDraftBanner(0)} className="shrink-0 text-blue-400">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
      )}

      <div className="p-4 space-y-4">
        {/* ── 검색 · 선택 카드 ──────────────────────────────────────────── */}
        <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-gray-100 space-y-4">

          {/* LOT 검색 입력 */}
          {!selectedLot && (
            <form onSubmit={handleSearch} className="space-y-3">
              {!scannerOpen && (
                <label className="text-[13px] font-bold text-gray-500 ml-1">
                  품목명 또는 LOT 번호
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
                  autoFocus={!scannerOpen}
                  placeholder={scannerOpen ? '스캔 결과 또는 직접 입력' : '예: 고등어, 0001'}
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="flex-1 min-w-0 bg-gray-100 text-gray-900 text-[15px] font-bold rounded-2xl px-4 py-3.5 outline-none focus:ring-2 focus:ring-[#FF3B30] transition-all"
                />
                <button
                  type="submit"
                  disabled={isSearching}
                  className="shrink-0 bg-[#FF3B30] text-white px-5 rounded-2xl active:scale-95 transition-transform disabled:opacity-50"
                >
                  {isSearching
                    ? <span className="text-[13px] font-bold px-1">...</span>
                    : <MagnifyingGlassIcon className="w-5 h-5" />
                  }
                </button>
                {hasCamera !== false && (
                  <button
                    type="button"
                    onClick={() => setScannerOpen((v) => !v)}
                    className={`shrink-0 w-12 rounded-2xl flex items-center justify-center active:scale-95 transition-all ${
                      scannerOpen ? 'bg-[#FF3B30] text-white' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    <QrCodeIcon className="w-5 h-5" />
                  </button>
                )}
              </div>
            </form>
          )}

          {/* ── 검색 결과 리스트 ─────────────────────────────────────────── */}
          {!selectedLot && searchResults.length > 0 && (
            <div className="space-y-2">
              <p className="text-[12px] font-bold text-gray-400 ml-1">
                출고할 상품을 선택하세요 ({searchResults.length}건)
              </p>
              {searchResults.map((lot) => (
                <button
                  key={lot.id}
                  onClick={() => setSelectedLot(lot)}
                  className="w-full text-left p-4 rounded-2xl border border-red-100 bg-red-50 active:scale-95 transition-all"
                >
                  <p className="font-mono text-[12px] font-black text-[#FF3B30] tracking-tight mb-1">
                    {lot.fields['LOT번호']}
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[15px] font-black text-gray-800">
                      {lot.fields['품목명']}{' '}
                      <span className="text-[13px] text-gray-500 font-normal">
                        (규격 {lot.fields['규격']}kg /{' '}
                        {formatMisuDisplay(lot.fields['미수'] ?? lot.fields['상세규격_표기'])})
                      </span>
                    </p>
                    <p className="text-[13px] font-bold text-blue-600 shrink-0">
                      {formatIntKo(Math.trunc(Number(lot.fields['재고수량'] ?? 0)))}박스
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
                  <span className="inline-block px-2 py-1 bg-red-100 text-[#FF3B30] text-[11px] font-black rounded-md mb-2">
                    선택된 상품
                  </span>
                  <p className="text-[15px] font-black text-gray-800">
                    {selectedLot.fields['품목명']}{' '}
                    <span className="text-[13px] text-gray-500 font-normal">
                      (규격 {selectedLot.fields['규격']}kg /{' '}
                      {formatMisuDisplay(
                        selectedLot.fields['미수'] ?? selectedLot.fields['상세규격_표기'],
                      )}
                      )
                    </span>
                  </p>
                  <p className="font-mono text-[12px] font-black text-[#FF3B30] tracking-tight mt-0.5">
                    {selectedLot.fields['LOT번호']}
                  </p>
                </div>
                <button onClick={resetForm} className="text-[12px] text-gray-400 underline p-2 shrink-0">
                  다시 검색
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-[13px] font-bold text-gray-500 ml-1">현재 남은 재고</label>
                  <div className="w-full bg-gray-100 rounded-2xl px-4 py-3.5 text-[15px] font-bold text-blue-600">
                    {formatIntKo(Math.trunc(Number(selectedLot.fields['재고수량'] ?? 0)))}박스
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[13px] font-bold text-gray-500 ml-1">출고할 수량</label>
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
                    className="w-full bg-gray-100 rounded-2xl px-4 py-3.5 text-[15px] font-bold text-[#FF3B30] outline-none focus:ring-2 focus:ring-[#FF3B30] transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[13px] font-bold text-gray-500 ml-1">보관처</label>
                <div className="w-full bg-gray-100 rounded-2xl px-4 py-3.5 text-[15px] font-bold text-gray-700">
                  {String(selectedLot.fields['보관처'] ?? '').trim() || '—'}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-[13px] font-bold text-gray-500 ml-1">판매처</label>
                  <input
                    type="text"
                    placeholder="직접입력"
                    value={seller}
                    onChange={(e) => setSeller(e.target.value)}
                    className="w-full bg-gray-100 rounded-2xl px-4 py-3.5 text-[15px] font-bold text-gray-800 outline-none focus:ring-2 focus:ring-[#FF3B30] transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[13px] font-bold text-gray-500 ml-1">판매 금액</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="예: 50,000"
                    value={salePrice}
                    onChange={(e) => {
                      const { display } = fromGroupedIntegerInput(e.target.value);
                      setSalePrice(display);
                    }}
                    className="w-full bg-gray-100 rounded-2xl px-4 py-3.5 text-[15px] font-bold text-gray-800 outline-none focus:ring-2 focus:ring-[#FF3B30] transition-all"
                  />
                </div>
              </div>

              <button
                onClick={handleAddToCart}
                className="w-full py-4 rounded-2xl bg-gray-800 text-white text-[16px] font-black active:scale-95 transition-all"
              >
                + 출고 목록에 추가
              </button>
            </div>
          )}
        </div>

        {/* ── 장바구니 리스트 ──────────────────────────────────────────────── */}
        {cart.length > 0 && (
          <div className="space-y-3">
            <p className="text-[12px] font-bold text-gray-400 ml-1">
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
                    <p className="truncate text-[14px] font-black text-gray-800">
                      {item.productName}{' '}
                      <span className="text-[12px] font-normal text-gray-500">
                        ({item.spec}kg / {formatMisuDisplay(item.misu)})
                      </span>
                    </p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <span className="text-[13px] font-bold text-[#FF3B30]">
                        {formatIntKo(item.quantity)}박스
                      </span>
                      {item.seller && (
                        <span className="text-[12px] text-gray-500">{item.seller}</span>
                      )}
                      {item.salePrice != null && (
                        <span className="text-[12px] text-gray-500">
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
                      className="p-2 text-gray-300 hover:text-red-500 active:scale-90 transition-all"
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
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#F2F4F6] border-t border-gray-200">
          <button
            onClick={handleSubmitAll}
            disabled={isSubmitting}
            className={`w-full py-5 rounded-2xl text-[18px] font-black text-white shadow-lg transition-all ${
              isSubmitting ? 'bg-red-300 cursor-not-allowed' : 'bg-[#FF3B30] active:scale-[0.98]'
            }`}
          >
            {isSubmitting ? '신청 중...' : `출고 신청 (${cart.length}건)`}
          </button>
        </div>
      )}
    </main>
  );
}
