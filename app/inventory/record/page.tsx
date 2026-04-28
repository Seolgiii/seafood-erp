"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { TrashIcon } from "@heroicons/react/24/outline";
import {
  createInventoryRecord,
  getStorageOptions,
  getProductOptions,
  getSupplierOptions,
} from "@/app/actions";
import { readSession } from "@/lib/session";
import PageHeader from "@/components/PageHeader";
import { toast } from "@/lib/toast";

type CartItem = {
  cartId: string;
  itemName: string;
  itemCategory: string;
  spec: string;
  count: string;
  quantity: number;
  price: number;
  storageId: string;
  storageName: string;
  origin: string;
  supplier: string;
  supplierId: string;
  shipName: string;
  remarks: string;
};

export default function InventoryRecordPage() {
  const router = useRouter();
  const [workerId, setWorkerId] = useState("");
  const [buyerName, setBuyerName] = useState("");

  const [formData, setFormData] = useState({
    itemName: "",
    itemCategory: "",
    spec: "",
    count: "",
    quantity: "",
    price: "",
    storage: "",
    origin: "국내산",
    supplier: "",
    shipName: "",
    remarks: "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [productOptions, setProductOptions] = useState<{ id: string; name: string; category: string }[]>([]);
  const [itemQuery, setItemQuery] = useState("");
  const [itemOpen, setItemOpen] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);

  const [storageOptions, setStorageOptions] = useState<{ id: string; name: string }[]>([]);
  const [storageQuery, setStorageQuery] = useState("");
  const [storageOpen, setStorageOpen] = useState(false);
  const [storageId, setStorageId] = useState("");
  const storageRef = useRef<HTMLDivElement>(null);

  const [supplierOptions, setSupplierOptions] = useState<{ id: string; name: string }[]>([]);
  const [supplierQuery, setSupplierQuery] = useState("");
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const supplierRef = useRef<HTMLDivElement>(null);

  const [cart, setCart] = useState<CartItem[]>([]);

  const isImport = formData.itemCategory === "사료";

  useEffect(() => {
    const s = readSession();
    if (s) {
      setWorkerId(s.workerId);
      setBuyerName(s.workerName);
    }
  }, []);

  useEffect(() => {
    getProductOptions().then(setProductOptions).catch(() => {});
    getStorageOptions().then(setStorageOptions).catch(() => {});
    getSupplierOptions().then(setSupplierOptions).catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (itemRef.current && !itemRef.current.contains(e.target as Node)) setItemOpen(false);
      if (storageRef.current && !storageRef.current.contains(e.target as Node)) setStorageOpen(false);
      if (supplierRef.current && !supplierRef.current.contains(e.target as Node)) setSupplierOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filteredProducts = productOptions.filter((opt) => opt.name.includes(itemQuery));
  const filteredStorage = storageOptions.filter((opt) => opt.name.includes(storageQuery));
  const filteredSuppliers = supplierOptions.filter((opt) => opt.name.includes(supplierQuery));

  const handleNumberChange = (field: string, value: string) => {
    const numericValue = value.replace(/\D/g, "");
    const commaValue = numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    setFormData({ ...formData, [field]: commaValue });
  };

  const selectProduct = (opt: { name: string; category: string }) => {
    const imported = opt.category === "사료";
    setItemQuery(opt.name);
    setFormData((prev) => ({
      ...prev,
      itemName: opt.name,
      itemCategory: opt.category,
      origin: imported ? "수입산" : "국내산",
      shipName: imported ? "" : prev.shipName,
    }));
    setItemOpen(false);
  };

  const handleAddToCart = () => {
    if (!formData.itemName.trim()) { toast("품목명을 입력해주세요."); return; }
    if (!formData.quantity.trim()) { toast("입고 수량을 입력해주세요."); return; }

    const finalOrigin = isImport ? (formData.origin.trim() || "수입산") : "국내산";

    setCart((prev) => [
      ...prev,
      {
        cartId: String(Date.now()),
        itemName: formData.itemName,
        itemCategory: formData.itemCategory,
        spec: formData.spec,
        count: formData.count,
        quantity: Number(formData.quantity.replace(/,/g, "")),
        price: Number(formData.price.replace(/,/g, "")),
        storageId,
        storageName: storageQuery,
        origin: finalOrigin,
        supplier: formData.supplier,
        supplierId,
        shipName: isImport ? "" : formData.shipName,
        remarks: formData.remarks,
      },
    ]);

    setFormData({
      itemName: "", itemCategory: "", spec: "", count: "",
      quantity: "", price: "", storage: "", origin: "국내산",
      supplier: "", shipName: "", remarks: "",
    });
    setItemQuery("");
    setStorageQuery("");
    setStorageId("");
    setSupplierQuery("");
    setSupplierId("");
  };

  const handleSubmitAll = async () => {
    if (cart.length === 0) return;
    if (!workerId) { toast("로그인 정보를 확인해주세요."); return; }
    setIsSubmitting(true);

    const today = new Date()
      .toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" })
      .replace(/\. /g, "/")
      .replace(/\./g, "");

    for (const item of cart) {
      try {
        const result = await createInventoryRecord({
          입고일자: today,
          품목명: item.itemName,
          규격: item.spec,
          미수: item.count,
          "입고수량(BOX)": item.quantity,
          수매가: item.price,
          storageRecordId: item.storageId,
          원산지: item.origin,
          매입처: item.supplier,
          매입처RecordId: item.supplierId,
          선박명: item.shipName,
          비고: item.remarks,
          작업자: workerId,
        });
        if (!result.success) {
          setIsSubmitting(false);
          toast(`입고 등록 실패 (${item.itemName}): 서버 통신 오류`);
          return;
        }
      } catch {
        setIsSubmitting(false);
        toast("처리 중 오류가 발생했습니다.");
        return;
      }
    }

    setIsSubmitting(false);
    toast("입고 신청이 완료되었습니다.", "success");
    router.push("/");
  };

  return (
    <div className={`min-h-screen bg-[#F2F4F6] flex flex-col font-['Spoqa_Han_Sans_Neo'] ${cart.length > 0 ? 'pb-32' : 'pb-10'}`}>
      <PageHeader
        title="물품 입고"
        subtitle="어떤 물건이 들어왔나요?"
        onBack={() => router.push("/")}
        titleClassName="text-[#3182F6] font-black"
      />

      <main className="p-5 flex flex-col gap-5">
        <div className="bg-white p-6 rounded-[28px] shadow-[0_8px_24px_rgba(149,157,165,0.08)] flex flex-col gap-6">

          {/* ① 무엇을 */}
          <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-[14px] font-bold text-gray-500 ml-1">품목명 (필수)</label>
              <div ref={itemRef} className="relative">
                <input
                  type="text"
                  value={itemQuery}
                  onChange={(e) => {
                    setItemQuery(e.target.value);
                    setFormData({ ...formData, itemName: e.target.value, itemCategory: "" });
                    setItemOpen(true);
                  }}
                  onFocus={() => setItemOpen(true)}
                  placeholder="품목명 검색 또는 직접 입력"
                  className="w-full bg-gray-100 text-gray-900 text-[15px] font-bold rounded-2xl p-4 outline-none focus:ring-2 focus:ring-[#3182F6] transition-all"
                />
                {itemOpen && filteredProducts.length > 0 && (
                  <ul className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-2xl shadow-lg max-h-48 overflow-y-auto">
                    {filteredProducts.map((opt) => (
                      <li
                        key={opt.id}
                        onMouseDown={(e) => { e.preventDefault(); selectProduct(opt); }}
                        className="px-4 py-3 text-[14px] font-bold text-gray-800 hover:bg-blue-50 cursor-pointer first:rounded-t-2xl last:rounded-b-2xl flex items-center justify-between"
                      >
                        <span>{opt.name}</span>
                        {opt.category && <span className="text-[12px] font-medium text-gray-400">{opt.category}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {formData.itemCategory && (
                <div className="flex items-center gap-2 ml-1">
                  <span className="text-[12px] font-bold text-[#3182F6]">품목구분: {formData.itemCategory}</span>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${isImport ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>
                    {isImport ? "수입산" : "국내산"}
                  </span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <label className="text-[14px] font-bold text-gray-500 ml-1">규격</label>
                <input type="text" value={formData.spec} onChange={(e) => setFormData({ ...formData, spec: e.target.value })} placeholder="예 : 10" className="w-full bg-gray-100 text-gray-900 text-[15px] font-bold rounded-2xl p-4 outline-none focus:ring-2 focus:ring-[#3182F6] transition-all" />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[14px] font-bold text-gray-500 ml-1">미수</label>
                <input type="text" value={formData.count} onChange={(e) => setFormData({ ...formData, count: e.target.value })} placeholder="예 : 42/44미" className="w-full bg-gray-100 text-gray-900 text-[15px] font-bold rounded-2xl p-4 outline-none focus:ring-2 focus:ring-[#3182F6] transition-all" />
              </div>
            </div>
          </section>

          <hr className="border-gray-100" />

          {/* ② 얼마나 */}
          <section className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <label className="text-[14px] font-bold text-[#3182F6] ml-1">수량 (BOX)</label>
                <input type="text" inputMode="numeric" value={formData.quantity} onChange={(e) => handleNumberChange("quantity", e.target.value)} placeholder="0" className="w-full bg-blue-50 text-[#3182F6] text-[15px] font-bold rounded-2xl p-4 outline-none focus:ring-2 focus:ring-[#3182F6] transition-all" />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[14px] font-bold text-gray-500 ml-1">수매가 (원)</label>
                <input type="text" inputMode="numeric" value={formData.price} onChange={(e) => handleNumberChange("price", e.target.value)} placeholder="0" className="w-full bg-gray-100 text-gray-900 text-[15px] font-bold rounded-2xl p-4 outline-none focus:ring-2 focus:ring-[#3182F6] transition-all" />
              </div>
            </div>
          </section>

          <hr className="border-gray-100" />

          {/* ③ 어디서 → 어디로 */}
          <section className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <label className="text-[14px] font-bold text-gray-500 ml-1">매입처 (출발)</label>
                <div ref={supplierRef} className="relative">
                  <input
                    type="text"
                    value={supplierQuery}
                    onChange={(e) => { setSupplierQuery(e.target.value); setFormData({ ...formData, supplier: e.target.value }); setSupplierId(""); setSupplierOpen(true); }}
                    onFocus={() => setSupplierOpen(true)}
                    placeholder="매입처 검색"
                    className="w-full bg-gray-100 text-gray-900 text-[15px] font-bold rounded-2xl p-4 outline-none focus:ring-2 focus:ring-[#3182F6] transition-all"
                  />
                  {supplierOpen && filteredSuppliers.length > 0 && (
                    <ul className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-2xl shadow-lg max-h-48 overflow-y-auto">
                      {filteredSuppliers.map((opt) => (
                        <li key={opt.id || opt.name} onMouseDown={(e) => { e.preventDefault(); setSupplierQuery(opt.name); setFormData({ ...formData, supplier: opt.name }); setSupplierId(opt.id); setSupplierOpen(false); }} className="px-4 py-3 text-[14px] font-bold text-gray-800 hover:bg-blue-50 cursor-pointer first:rounded-t-2xl last:rounded-b-2xl">
                          {opt.name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[14px] font-bold text-gray-500 ml-1">보관처 (도착)</label>
                <div ref={storageRef} className="relative">
                  <input
                    type="text"
                    value={storageQuery}
                    onChange={(e) => { setStorageQuery(e.target.value); setFormData({ ...formData, storage: e.target.value }); setStorageOpen(true); }}
                    onFocus={() => setStorageOpen(true)}
                    placeholder="보관처 입력"
                    className="w-full bg-gray-100 text-gray-900 text-[15px] font-bold rounded-2xl p-4 outline-none focus:ring-2 focus:ring-[#3182F6] transition-all"
                  />
                  {storageOpen && filteredStorage.length > 0 && (
                    <ul className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-2xl shadow-lg max-h-48 overflow-y-auto">
                      {filteredStorage.map((opt) => (
                        <li key={opt.id} onMouseDown={(e) => { e.preventDefault(); setStorageQuery(opt.name); setStorageId(opt.id); setFormData({ ...formData, storage: opt.name }); setStorageOpen(false); }} className="px-4 py-3 text-[14px] font-bold text-gray-800 hover:bg-blue-50 cursor-pointer first:rounded-t-2xl last:rounded-b-2xl">
                          {opt.name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            {isImport ? (
              <div className="flex flex-col gap-2">
                <label className="text-[14px] font-bold text-gray-500 ml-1">원산지 (수입산)</label>
                <input type="text" value={formData.origin} onChange={(e) => setFormData({ ...formData, origin: e.target.value })} placeholder="예 : 수입산, 러시아, 노르웨이" className="w-full bg-gray-100 text-gray-900 text-[15px] font-bold rounded-2xl p-4 outline-none focus:ring-2 focus:ring-[#3182F6] transition-all" />
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <label className="text-[14px] font-bold text-gray-500 ml-1">선박명 (선택)</label>
                <input type="text" value={formData.shipName} onChange={(e) => setFormData({ ...formData, shipName: e.target.value })} placeholder="선박명 입력 (없으면 비워두세요)" className="w-full bg-gray-100 text-gray-900 text-[15px] font-bold rounded-2xl p-4 outline-none focus:ring-2 focus:ring-[#3182F6] transition-all" />
              </div>
            )}
          </section>

          <hr className="border-gray-100" />

          {/* ④ 누가 · 메모 */}
          <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-[14px] font-bold text-gray-500 ml-1">매입자</label>
              <input type="text" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="매입자 입력" className="w-full bg-gray-100 text-gray-900 text-[15px] font-bold rounded-2xl p-4 outline-none focus:ring-2 focus:ring-[#3182F6] transition-all" />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-[14px] font-bold text-gray-500 ml-1">비고</label>
              <textarea value={formData.remarks} onChange={(e) => setFormData({ ...formData, remarks: e.target.value })} placeholder="특이사항을 입력하세요" className="w-full bg-gray-100 text-gray-900 text-[15px] font-bold rounded-2xl p-4 outline-none focus:ring-2 focus:ring-[#3182F6] transition-all resize-none min-h-[100px]" />
            </div>
          </section>
        </div>

        <button
          onClick={handleAddToCart}
          className="w-full text-white text-[18px] font-black py-5 rounded-[24px] transition-all active:scale-95 shadow-lg bg-gray-800"
        >
          + 입고 추가
        </button>

        {/* 입고 목록 */}
        {cart.length > 0 && (
          <div className="space-y-3">
            <p className="text-[12px] font-bold text-gray-400 ml-1">입고 목록 ({cart.length}건)</p>
            <div className="grid grid-cols-2 gap-3">
              {cart.map((item) => (
                <div key={item.cartId} className="flex min-h-0 min-w-0 items-stretch gap-2 bg-white rounded-2xl border border-gray-100 p-3 shadow-sm">
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-[14px] font-black text-gray-800">{item.itemName}</p>
                    {(item.spec || item.count) && (
                      <p className="text-[11px] text-gray-400 truncate">
                        {item.spec && `${item.spec}kg`}{item.spec && item.count && ' · '}{item.count}
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap gap-1">
                      <span className="text-[13px] font-bold text-[#3182F6]">{item.quantity.toLocaleString()}박스</span>
                      {item.storageName && <span className="text-[12px] text-gray-400 truncate">→ {item.storageName}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center justify-end">
                    <button
                      onClick={() => setCart((prev) => prev.filter((c) => c.cartId !== item.cartId))}
                      className="p-2 text-gray-300 hover:text-red-500 active:scale-90 transition-all"
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
              isSubmitting ? 'bg-blue-300 cursor-not-allowed' : 'bg-[#3182F6] active:scale-[0.98]'
            }`}
          >
            {isSubmitting ? '신청 중...' : `입고 신청하기 (${cart.length}건)`}
          </button>
        </div>
      )}
    </div>
  );
}
