export type PendingTxnRow = {
  id: string;
  date: string;
  requestedQty: number;
  unit: string;
  yieldVarianceDetail: number;
  workerId: string | null;
  workerName: string;
  lotId: string | null;
  lotNumber: string;
  productId: string | null;
  productName: string;
  spec: string;
  detailSpec: string;
  baseUnitLabel: string;
  detailUnitLabel: string;
  detailPerBase: number | null;
};

export type N8nOutboundPayload = {
  event: "outbound_approved";
  approvedAt: string;
  specText: string;
  unitText: string;
  transaction: {
    id: string;
    date: string;
    requestedQty: number;
    unit: string;
    status: string;
    yieldVarianceDetail: number;
  };
  product: {
    id: string | null;
    name: string;
    spec: string;
    unitBase: string;
    unitDetail: string;
    detailPerBase: number | null;
  };
  worker: { id: string | null; name: string };
  lot: { id: string | null; lotNumber: string };
  inventory: {
    before: { base: number; detail: number };
    after: { base: number; detail: number };
  };
};
