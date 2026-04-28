import { log, logError, logWarn } from '@/lib/logger';
"use server";

import { unstable_cache } from "next/cache";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

const PENDING_STATUSES = ["승인 대기", "최종 승인 대기"] as const;

type AirtableRecord = {
  id: string;
  fields: Record<string, unknown>;
  createdTime?: string;
};

type AirtableListResponse = {
  records?: Array<{ id?: string; fields?: Record<string, unknown>; createdTime?: string }>;
  offset?: string;
};

export type DashboardStats = {
  todayInbound: number;
  todayOutbound: number;
  pendingApprovals: number;
};

function tableSegmentForUrl(tableName: string): string {
  const t = tableName.trim();
  if (/^tbl[0-9a-zA-Z]+$/i.test(t)) return t;
  if (/%[0-9A-Fa-f]{2}/.test(t)) return t;
  return encodeURIComponent(t);
}

async function fetchAllRecords(
  tableName: string,
  fields?: string[],
): Promise<AirtableRecord[]> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) return [];

  const records: AirtableRecord[] = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams();
    if (fields) for (const f of fields) params.append("fields[]", f);
    if (offset) params.set("offset", offset);
    params.set("pageSize", "100");

    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableSegmentForUrl(tableName)}?${params.toString()}`;
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
        cache: "no-store",
      });
      if (!res.ok) {
        logError(`[dashboard] ${tableName} fetch 실패: ${res.status}`);
        break;
      }
      const data = (await res.json()) as AirtableListResponse;
      for (const rec of data.records ?? []) {
        records.push({
          id: String(rec.id ?? ""),
          fields: rec.fields ?? {},
          createdTime: rec.createdTime,
        });
      }
      offset = data.offset;
    } catch (e) {
      logError(`[dashboard] ${tableName} fetch 예외:`, e);
      break;
    }
  } while (offset);

  return records;
}

function isTodayLocal(value: unknown): boolean {
  if (!value) return false;
  const s = String(value).trim().slice(0, 10);
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return (
    s === `${y}/${m}/${d}` ||
    s === `${y}-${m}-${d}` ||
    s === `${y}.${m}.${d}`
  );
}

function firstRecordId(val: unknown): string | null {
  if (typeof val === "string" && /^rec[a-zA-Z0-9]+$/.test(val.trim())) return val.trim();
  if (Array.isArray(val)) {
    for (const v of val) {
      if (typeof v === "string" && /^rec[a-zA-Z0-9]+$/.test(v.trim())) return v.trim();
    }
  }
  return null;
}

async function computeStats(requesterWorkerId?: string): Promise<DashboardStats> {
  const [inbound, outbound, expense] = await Promise.all([
    fetchAllRecords("입고 관리"),
    fetchAllRecords("출고 관리"),
    fetchAllRecords("지출결의"),
  ]);

  const todayInbound = inbound.filter((r) =>
    isTodayLocal(r.fields["입고일자"] ?? r.fields["입고일"]),
  ).length;

  const todayOutbound = outbound.filter((r) =>
    isTodayLocal(r.fields["출고일"]),
  ).length;

  const isPending = (r: AirtableRecord) => {
    const status = String(r.fields["승인상태"] ?? "").trim();
    return (PENDING_STATUSES as readonly string[]).includes(status);
  };

  const isMine = (r: AirtableRecord, linkField: string) => {
    if (!requesterWorkerId) return true;
    const id = firstRecordId(r.fields[linkField]);
    return id === requesterWorkerId;
  };

  const inboundPending = inbound.filter((r) => isPending(r) && isMine(r, "작업자")).length;
  const outboundPending = outbound.filter((r) => isPending(r) && isMine(r, "작업자")).length;
  const expensePending = expense.filter((r) => isPending(r) && isMine(r, "신청자")).length;

  const stats: DashboardStats = {
    todayInbound,
    todayOutbound,
    pendingApprovals: inboundPending + outboundPending + expensePending,
  };

  log("[dashboard] stats", { requesterWorkerId: requesterWorkerId ?? "ALL", ...stats });
  return stats;
}

export async function getDashboardStats(
  requesterWorkerId?: string,
): Promise<DashboardStats> {
  const key = requesterWorkerId ?? "ALL";
  const cached = unstable_cache(
    () => computeStats(requesterWorkerId),
    [`dashboard-stats:${key}`],
    { revalidate: 60, tags: ["dashboard-stats"] },
  );
  return cached();
}
