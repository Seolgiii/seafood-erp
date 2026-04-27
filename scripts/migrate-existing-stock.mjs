/**
 * 기존 재고 입고관리 마이그레이션 스크립트
 *
 * LOT별 재고 테이블에서 `입고관리링크`가 비어 있는 레코드를 찾아,
 * 입고관리 테이블에 대응 레코드를 일괄 생성하고 양방향 link를 채웁니다.
 *
 * 입고수량/잔여수량은 LOT별 재고.재고수량으로 채웁니다 (현재 재고를 초기 입고로 가정).
 * 비고는 "기존 재고"로 표기합니다.
 * 작업자/매입자/품목마스터 link는 비워둡니다 (Airtable이 허용하면 그대로, 거부하면 알림).
 *
 * 실행:
 *   node scripts/migrate-existing-stock.mjs                 (default: dry-run)
 *   node scripts/migrate-existing-stock.mjs --execute       (실제 실행)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ── .env.local 파싱 ──────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../.env.local");

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    env[key] = val;
  }
  return env;
}

const env = loadEnv(envPath);
const API_KEY = env.AIRTABLE_API_KEY ?? "";
const BASE_ID = env.AIRTABLE_BASE_ID ?? "";

if (!API_KEY || !BASE_ID) {
  console.error("❌ AIRTABLE_API_KEY 또는 AIRTABLE_BASE_ID가 .env.local에 없습니다.");
  process.exit(1);
}

const EXECUTE = process.argv.includes("--execute");
const DRY_RUN = !EXECUTE;

const API = "https://api.airtable.com/v0";
const LOT_TABLE = env.AIRTABLE_LOT_TABLE?.trim() || "LOT별 재고";
const INBOUND_TABLE = env.AIRTABLE_INBOUND_TABLE?.trim() || "입고 관리";
const LOT_TO_INBOUND_FIELD = env.AIRTABLE_LOT_TO_INBOUND_FIELD?.trim() || "입고관리링크";
const STORAGE_MASTER_TABLE = "보관처 마스터";
const STORAGE_NAME_FIELD = "보관처명";

const HEADERS = {
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
};

// ── 보관처 마스터 fetch → 이름:id 맵 ─────────────────────────────────────────
async function fetchStorageMasterMap() {
  const map = {};
  let offset;
  do {
    const params = new URLSearchParams({ pageSize: "100" });
    if (offset) params.set("offset", offset);
    const url = `${API}/${BASE_ID}/${encodeURIComponent(STORAGE_MASTER_TABLE)}?${params.toString()}`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`보관처 마스터 fetch 실패 ${res.status}: ${body}`);
    }
    const data = await res.json();
    for (const rec of data.records ?? []) {
      const name = rec.fields?.[STORAGE_NAME_FIELD];
      if (name) map[name.trim()] = rec.id;
    }
    offset = data.offset;
  } while (offset);
  return map;
}

// ── LOT별 재고에서 입고관리링크 비어 있는 레코드 전부 fetch (pagination) ─────
async function fetchTargetLots() {
  const records = [];
  let offset;
  do {
    const params = new URLSearchParams({
      filterByFormula: `NOT({${LOT_TO_INBOUND_FIELD}})`,
      pageSize: "100",
    });
    if (offset) params.set("offset", offset);
    const url = `${API}/${BASE_ID}/${encodeURIComponent(LOT_TABLE)}?${params.toString()}`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`LOT별 재고 fetch 실패 ${res.status}: ${body}`);
    }
    const data = await res.json();
    records.push(...(data.records || []));
    offset = data.offset;
  } while (offset);
  return records;
}

// ── 입고관리에 INSERT 할 fields 구성 ─────────────────────────────────────────
function buildInboundFields(lot, storageMasterMap) {
  const f = lot.fields ?? {};
  const stockQty = Number(
    Array.isArray(f["재고수량"]) ? f["재고수량"][0] : f["재고수량"],
  ) || 0;

  const fields = {
    LOT번호: String(f["LOT번호"] ?? ""),
    입고일: String(f["입고일자"] ?? ""),
    규격: String(f["규격"] ?? ""),
    미수: String(f["미수"] ?? ""),
    원산지: String(f["원산지"] ?? ""),
    입고수량: stockQty,
    잔여수량: stockQty,
    승인상태: "승인 완료",
    비고: "기존 재고",
  };

  // 보관처 — 마스터 맵에서 record id 찾아 link로 연결
  const storageName = String(f["보관처"] ?? "").trim();
  const storageId = storageMasterMap[storageName];
  if (storageId) {
    fields["보관처"] = [storageId];
  } else if (storageName) {
    console.warn(`  [warn] 보관처 마스터에 없는 값: "${storageName}" (LOT=${f["LOT번호"]})`);
  }

  // 매입처는 link 필드 — LOT별 재고에 link로 들어 있으면 record id 배열 그대로 복사
  const supplier = f["매입처"];
  if (Array.isArray(supplier) && supplier.length > 0) {
    fields["매입처"] = supplier;
  }

  // 빈 문자열은 필드 누락으로 처리 (Airtable 거부 방지)
  for (const key of Object.keys(fields)) {
    if (fields[key] === "" || fields[key] === undefined || fields[key] === null) {
      delete fields[key];
    }
  }
  return fields;
}

// ── INSERT + LOT별 재고 PATCH ────────────────────────────────────────────────
async function migrateOne(lot, storageMasterMap) {
  const fields = buildInboundFields(lot, storageMasterMap);

  // 1) 입고관리 INSERT
  const insertRes = await fetch(`${API}/${BASE_ID}/${encodeURIComponent(INBOUND_TABLE)}`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ fields }),
  });
  if (!insertRes.ok) {
    const body = await insertRes.text().catch(() => "");
    throw new Error(`입고관리 INSERT 실패 ${insertRes.status}: ${body}`);
  }
  const created = await insertRes.json();
  const inboundId = created?.id;
  if (!inboundId || !/^rec/.test(inboundId)) {
    throw new Error(`입고관리 INSERT 응답에 record id 없음: ${JSON.stringify(created)}`);
  }

  // 2) LOT별 재고.입고관리링크 PATCH
  const patchRes = await fetch(
    `${API}/${BASE_ID}/${encodeURIComponent(LOT_TABLE)}/${lot.id}`,
    {
      method: "PATCH",
      headers: HEADERS,
      body: JSON.stringify({ fields: { [LOT_TO_INBOUND_FIELD]: [inboundId] } }),
    },
  );
  if (!patchRes.ok) {
    const body = await patchRes.text().catch(() => "");
    // 이 경우 입고관리 레코드는 만들어졌는데 link만 실패 — 수동 정리 필요할 수 있음
    throw new Error(
      `LOT별 재고 PATCH 실패 ${patchRes.status}: ${body} (입고관리 record=${inboundId})`,
    );
  }
  return inboundId;
}

// ── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[migrate] 모드: ${DRY_RUN ? "DRY RUN (실제 변경 없음)" : "EXECUTE (실제 적용)"}`);
  console.log(`[migrate] 대상 테이블: ${LOT_TABLE} → ${INBOUND_TABLE}`);
  console.log(`[migrate] link 필드: ${LOT_TO_INBOUND_FIELD}\n`);

  console.log("[migrate] 보관처 마스터 fetch 중...");
  const storageMasterMap = await fetchStorageMasterMap();
  console.log(`[migrate] 보관처 마스터: ${Object.keys(storageMasterMap).length}건 로드\n`);

  console.log("[migrate] LOT별 재고 fetch 중...");
  const lots = await fetchTargetLots();
  console.log(`[migrate] 입고관리링크 비어 있는 LOT: ${lots.length}건\n`);

  if (lots.length === 0) {
    console.log("[migrate] 마이그레이션 대상 없음. 종료.");
    return;
  }

  if (DRY_RUN) {
    const preview = lots.slice(0, 3);
    console.log(`[migrate] === DRY RUN 미리보기 (${preview.length}/${lots.length}건) ===`);
    for (const lot of preview) {
      const fields = buildInboundFields(lot, storageMasterMap);
      console.log(`\n--- LOT id=${lot.id}, 번호=${lot.fields?.["LOT번호"] ?? "(없음)"} ---`);
      console.log("입고관리에 INSERT 될 fields:");
      console.log(JSON.stringify(fields, null, 2));
    }
    console.log(`\n[migrate] 총 ${lots.length}건이 마이그레이션 대상입니다.`);
    console.log("[migrate] 실제 실행: node scripts/migrate-existing-stock.mjs --execute");
    return;
  }

  // EXECUTE
  let success = 0;
  let failed = 0;
  const failures = [];
  for (let i = 0; i < lots.length; i++) {
    const lot = lots[i];
    try {
      const inboundId = await migrateOne(lot, storageMasterMap);
      success++;
      if ((i + 1) % 10 === 0 || i === lots.length - 1) {
        console.log(
          `[migrate] 진행 ${i + 1}/${lots.length} (성공 ${success}, 실패 ${failed})`,
        );
      }
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      failures.push({ lotId: lot.id, lotNumber: lot.fields?.["LOT번호"], error: msg });
      console.error(`[migrate] LOT id=${lot.id} 실패: ${msg}`);
    }
    // Airtable rate limit (5 req/s/base): INSERT+PATCH = 2 req. 220ms 간격 → ~4.5 req/s.
    await new Promise((r) => setTimeout(r, 220));
  }

  console.log(`\n[migrate] === 완료 ===`);
  console.log(`[migrate] 성공: ${success}건 / 실패: ${failed}건`);
  if (failures.length > 0) {
    console.log("\n[migrate] 실패 상세:");
    for (const f of failures) {
      console.log(`  - LOT id=${f.lotId} (번호=${f.lotNumber}): ${f.error}`);
    }
  }
}

main().catch((e) => {
  console.error("[migrate] 치명적 오류:", e);
  process.exit(1);
});
