"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  createInventoryRecord,
  getStorageOptions,
  getProductOptions,
  getSupplierOptions,
} from "@/app/actions";
import { ChevronLeftIcon } from "@heroicons/react/24/outline";
import { readSession } from "@/lib/session";

export default function InventoryRecordPage() {
  const router = useRouter();
  const [workerId, setWorkerId] = useState("");
  const [workerName, setWorkerName] = useState("");
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
  const [now, setNow] = useState<Date | null>(null);

  // 품목명 드롭다운 상태
  const [productOptions, setProductOptions] = useState<{ id: string; name: string; category: string }[]>([]);
  const [itemQuery, setItemQuery] = useState("");
  const [itemOpen, setItemOpen] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);

  // 보관처 드롭다운 상태
  const [storageOptions, setStorageOptions] = useState<string[]>([]);
  const [storageQuery, setStorageQuery] = useState("");
  const [storageOpen, setStorageOpen] = useState(false);
  const storageRef = useRef<HTMLDivElement>(null);

  // 매입처 드롭다운 상태
  const [supplierOptions, setSupplierOptions] = useState<string[]>([]);
  const [supplierQuery, setSupplierQuery] = useState("");
  const [supplierOpen, setSupplierOpen] = useState(false);
  const supplierRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const s = readSession();
    if (s) {
      setWorkerId(s.workerId);
      setWorkerName(s.workerName);
      setBuyerName(s.workerName);
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    getProductOptions().then((data) => {
      console.log("[품목옵션]", data.length, "건", data.slice(0, 3));
      setProductOptions(data);
    }).catch((e) => console.error("[품목옵션 오류]", e));

    getStorageOptions().then((data) => {
      console.log("[보관처옵션]", data);
      setStorageOptions(data);
    }).catch((e) => console.error("[보관처옵션 오류]", e));

    getSupplierOptions().then((data) => {
      console.log("[매입처옵션]", data.length, "건", data.slice(0, 3));
      setSupplierOptions(data);
    }).catch((e) => console.error("[매입처옵션 오류]", e));
  }, []);

  // 드롭다운 바깥 클릭 시 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (itemRef.current && !itemRef.current.contains(e.target as Node)) setItemOpen(false);
      if (storageRef.current && !storageRef.current.contains(e.target as Node)) setStorageOpen(false);
      if (supplierRef.current && !supplierRef.current.contains(e.target as Node)) setSupplierOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filteredProducts = productOptions.filter((opt) =>
    opt.name.includes(itemQuery)
  );
  const filteredStorage = storageOptions.filter((opt) => opt.includes(storageQuery));
  const filteredSuppliers = supplierOptions.filter((opt) => opt.includes(supplierQuery));

  const handleNumberChange = (field: string, value: string) => {
    const numericValue = value.replace(/\D/g, "");
    const commaValue = numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    setFormData({ ...formData, [field]: commaValue });
  };

  const handleSubmit = async () => {
    if (!formData.itemName.trim()) return alert("품목명을 입력해주세요.");
    if (!formData.quantity.trim()) return alert("입고 수량을 입력해주세요.");

    setIsSubmitting(true);
    try {
      const payload = {
        입고일자: (now ?? new Date()).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\. /g, "/").replace(/\./g, ""),
        품목명: formData.itemName,
        규격: formData.spec,
        미수: formData.count,
        "입고수량(BOX)": Number(formData.quantity.replace(/,/g, "")),
        수매가: Number(formData.price.replace(/,/g, "")),
        보관처: formData.storage,
        원산지: formData.origin,
        매입처: formData.supplier,
        선박명: formData.shipName,
        비고: formData.remarks,
        작업자: workerId,
      };
      const result = await createInventoryRecord(payload);
      if (result.success) {
        alert("입고 처리가 완료되었습니다.");
        router.push("/");
      } else {
        alert("입고 등록 실패: 서버 통신 오류");
      }
    } catch {
      alert("처리 중 에러가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F2F4F6] flex flex-col pb-10 font-['Spoqa_Han_Sans_Neo']">
      <header className="bg-white px-4 py-4 flex justify-between items-center sticky top-0 z-20 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/")}
            className="p-2 -ml-2 active:scale-95 transition-transform"
          >
            <ChevronLeftIcon className="w-6 h-6 text-gray-800" />
          </button>
          <div className="flex items-baseline gap-2">
            <h1 className="text-[18px] font-black tracking-tight text-[#3182F6]">
              물품 입고
            </h1>
            <span className="text-[13px] font-medium text-gray-500 whitespace-nowrap">
              어떤 물건이 들어왔나요?
            </span>
          </div>
        </div>
        <div className="text-right leading-tight">
          <p className="text-[11px] text-gray-500 font-medium">
            {now ? now.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" }) : ""}
          </p>
          <p className="text-[14px] font-bold text-gray-900">
            {now ? now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : ""}
          </p>
        </div>
      </header>

      <main className="p-5 flex flex-col gap-5">
        <div className="bg-white p-6 rounded-[28px] shadow-[0_8px_24px_rgba(149,157,165,0.08)] flex flex-col gap-5">

          {/* 품목명 — 품목마스터 검색 드롭다운 */}
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
                className="w-full bg-gray-100 text-gray-900 text-[18px] font-bold rounded-2xl p-4 outline-none focus:ring-2 focus:ring-[#3182F6] transition-all"
              />
              {itemOpen && filteredProducts.length > 0 && (
                <ul className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-2xl shadow-lg max-h-48 overflow-y-auto">
                  {filteredProducts.map((opt) => (
                    <li
                      key={opt.id}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setItemQuery(opt.name);
                        setFormData({ ...formData, itemName: opt.name, itemCategory: opt.category });
                        setItemOpen(false);
                      }}
                      className="px-4 py-3 text-[15px] font-bold text-gray-800 hover:bg-blue-50 cursor-pointer first:rounded-t-2xl last:rounded-b-2xl flex items-center justify-between"
                    >
                      <span>{opt.name}</span>
                      {opt.category && (
                        <span className="text-[12px] font-medium text-gray-400">{opt.category}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {formData.itemCategory && (
              <p className="text-[12px] font-bold text-[#3182F6] ml-1">
                품목구분: {formData.itemCategory}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <label className="text-[14px] font-bold text-gray-500 ml-1">규격</label>
              <input
                type="text"
                value={formData.spec}
                onChange={(e) => setFormData({ ...formData, spec: e.target.value })}
                placeholder="예 : 10"
                className="w-full bg-gray-100 text-gray-900 text-[16px] font-bold rounded-2xl p-4 outline-none focus:ring-2 focus:ring-[#3182F6] transition-all"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-[14px] font-bold text-gray-500 ml-1">미수</label>
              <input
                type="text"
                value={formData.count}
                onChange={(e) => setFormData({ ...formData, count: e.target.value })}
                placeholder="예 : 42/44미"
                className="w-full bg-gray-100 text-gray-900 text-[16px] font-bold rounded-2xl p-4 outline-none focus:ring-2 focus:ring-[#3182F6] transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <label className="text-[14px] font-bold text-[#3182F6] ml-1">수량 (BOX)</label>
              <input
                type="text"
                inputMode="numeric"
                value={formData.quantity}
                onChange={(e) => handleNumberChange("quantity", e.target.value)}
                placeholder="0"
                className="w-full bg-blue-50 text-[#3182F6] text-[18px] font-bold rounded-2xl p-4 outline-none focus:ring-2 focus:ring-[#3182F6] transition-all"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-[14px] font-bold text-gray-500 ml-1">수매가 (원)</label>
              <input
                type="text"
                inputMode="numeric"
                value={formData.price}
                onChange={(e) => handleNumberChange("price", e.target.value)}
                placeholder="0"
                className="w-full bg-gray-100 text-gray-900 text-[18px] font-bold rounded-2xl p-4 outline-none focus:ring-2 focus:ring-[#3182F6] transition-all"
              />
            </div>
          </div>

          {/* 보관처 + 원산지 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <label className="text-[14px] font-bold text-gray-500 ml-1">보관처</label>
              <div ref={storageRef} className="relative">
                <input
                  type="text"
                  value={storageQuery}
                  onChange={(e) => {
                    setStorageQuery(e.target.value);
                    setFormData({ ...formData, storage: e.target.value });
                    setStorageOpen(true);
                  }}
                  onFocus={() => setStorageOpen(true)}
                  placeholder="보관처 입력"
                  className="w-full bg-gray-100 text-gray-900 text-[16px] font-bold rounded-2xl p-4 outline-none focus:ring-2 focus:ring-[#3182F6] transition-all"
                />
                {storageOpen && filteredStorage.length > 0 && (
                  <ul className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-2xl shadow-lg max-h-48 overflow-y-auto">
                    {filteredStorage.map((opt) => (
                      <li
                        key={opt}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setStorageQuery(opt);
                          setFormData({ ...formData, storage: opt });
                          setStorageOpen(false);
                        }}
                        className="px-4 py-3 text-[15px] font-bold text-gray-800 hover:bg-blue-50 cursor-pointer first:rounded-t-2xl last:rounded-b-2xl"
                      >
                        {opt}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[14px] font-bold text-gray-500 ml-1">원산지</label>
              <input
                type="text"
                value={formData.origin}
                onChange={(e) => setFormData({ ...formData, origin: e.target.value })}
                className="w-full bg-gray-100 text-gray-900 text-[16px] font-bold rounded-2xl p-4 outline-none focus:ring-2 focus:ring-[#3182F6] transition-all"
              />
            </div>
          </div>

          {/* 매입처 + 선박명 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <label className="text-[14px] font-bold text-gray-500 ml-1">매입처</label>
              <div ref={supplierRef} className="relative">
                <input
                  type="text"
                  value={supplierQuery}
                  onChange={(e) => {
                    setSupplierQuery(e.target.value);
                    setFormData({ ...formData, supplier: e.target.value });
                    setSupplierOpen(true);
                  }}
                  onFocus={() => setSupplierOpen(true)}
                  placeholder="매입처 검색"
                  className="w-full bg-gray-100 text-gray-900 text-[16px] font-bold rounded-2xl p-4 outline-none focus:ring-2 focus:ring-[#3182F6] transition-all"
                />
                {supplierOpen && filteredSuppliers.length > 0 && (
                  <ul className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-2xl shadow-lg max-h-48 overflow-y-auto">
                    {filteredSuppliers.map((opt) => (
                      <li
                        key={opt}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSupplierQuery(opt);
                          setFormData({ ...formData, supplier: opt });
                          setSupplierOpen(false);
                        }}
                        className="px-4 py-3 text-[15px] font-bold text-gray-800 hover:bg-blue-50 cursor-pointer first:rounded-t-2xl last:rounded-b-2xl"
                      >
                        {opt}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[14px] font-bold text-gray-500 ml-1">선박명</label>
              <input
                type="text"
                value={formData.shipName}
                onChange={(e) => setFormData({ ...formData, shipName: e.target.value })}
                placeholder="선박명 입력"
                className="w-full bg-gray-100 text-gray-900 text-[16px] font-bold rounded-2xl p-4 outline-none focus:ring-2 focus:ring-[#3182F6] transition-all"
              />
            </div>
          </div>

          {/* 매입자 — 세션에서 자동 설정, 직접 수정 가능 */}
          <div className="flex flex-col gap-2">
            <label className="text-[14px] font-bold text-gray-500 ml-1">매입자</label>
            <input
              type="text"
              value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)}
              placeholder="매입자 입력"
              className="w-full bg-gray-100 text-gray-900 text-[16px] font-bold rounded-2xl p-4 outline-none focus:ring-2 focus:ring-[#3182F6] transition-all"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[14px] font-bold text-gray-500 ml-1">비고</label>
            <textarea
              value={formData.remarks}
              onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
              placeholder="특이사항을 입력하세요"
              className="w-full bg-gray-100 text-gray-900 text-[16px] font-bold rounded-2xl p-4 outline-none focus:ring-2 focus:ring-[#3182F6] transition-all resize-none min-h-[100px]"
            />
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className={`w-full text-white text-[18px] font-black py-5 rounded-[24px] transition-all active:scale-95 shadow-lg shadow-blue-100 mt-2 ${
            isSubmitting ? "bg-blue-400 cursor-not-allowed" : "bg-[#3182F6]"
          }`}
        >
          {isSubmitting ? "전송 중..." : "입고 신청하기"}
        </button>
      </main>
    </div>
  );
}
