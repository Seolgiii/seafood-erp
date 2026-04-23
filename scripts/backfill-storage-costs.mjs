/**
 * LOT별 재고 보관처 비용 일괄 백필 스크립트
 *
 * 냉장료단가 / 입출고비 / 노조비가 비어있는 LOT 레코드를 찾아
 * 보관처 비용 이력 테이블에서 입고일자 기준 요금을 조회해 일괄 업데이트합니다.
 *
 * 실행: node scripts/backfill-storage-costs.mjs
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

const API = "https://api.airtable.com/v0";
const LOT_TABLE = env.AIRTABLE_LOT_TABLE?.trim() || "LOT별 재고";
const COST_TABLE = env.AIRTABLE_STORAGE_COST_TABLE?.trim() || "보관처 비용 이력";

function headers() {
  return { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
}

function tableSegment(name) {
  return /^tbl[0-9a-zA-Z]+$/i.test(name) ? name : encodeURIComponent(name);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Airtable 유틸 ─────────────────────────────────────────────────────────────
async function airtableGet(path) {
  const res = await fetch(`${API}/${BASE_ID}/${path}`, { headers: headers() });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function airtablePatch(tableSeg, recordId, fields) {
  const res = await fetch(`${API}/${BASE_ID}/${tableSeg}/${recordId}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`PATCH ${recordId} → ${res.status}: ${await res.text()}`);
}

// ── LOT 전체 조회 (페이지네이션) ─────────────────────────────────────────────
async function fetchAllLots() {
  const tbl = tableSegment(LOT_TABLE);
  const fields = ["LOT번호", "보관처", "입고일자", "냉장료단가", "입출고비", "노조비"];
  const fieldsQs = fields.map((f) => `fields[]=${encodeURIComponent(f)}`).join("&");

  const records = [];
  let offset = "";

  do {
    const offsetQs = offset ? `&offset=${offset}` : "";
    const data = await airtableGet(`${tbl}?pageSize=100&${fieldsQs}${offsetQs}`);
    records.push(...(data.records ?? []));
    offset = data.offset ?? "";
    if (offset) await sleep(250);
  } while (offset);

  return records;
}

// ── 보관처 비용 이력 조회 (메모이제이션) ─────────────────────────────────────
const costCache = new Map();

async function getStorageCost(storage, inboundDate) {
  const key = `${storage}__${inboundDate}`;
  if (costCache.has(key)) return costCache.get(key);

  const tbl = tableSegment(COST_TABLE);
  const esc = storage.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const formula = [
    `AND(`,
    `{보관처명}="${esc}",`,
    `NOT(IS_AFTER({적용시작일},"${inboundDate}")),`,
    `OR({적용종료일}="",NOT(IS_BEFORE({적용종료일},"${inboundDate}")))`,
    `)`,
  ].join("");

  const fieldsQs = ["보관처명", "적용시작일", "적용종료일", "냉장료", "입출고비", "노조비"]
    .map((f) => `fields[]=${encodeURIComponent(f)}`)
    .join("&");

  const data = await airtableGet(
    `${tbl}?filterByFormula=${encodeURIComponent(formula)}&${fieldsQs}&pageSize=20`
  );

  const rows = data.records ?? [];
  if (!rows.length) { costCache.set(key, null); return null; }

  rows.sort((a, b) =>
    String(b.fields["적용시작일"] ?? "").localeCompare(String(a.fields["적용시작일"] ?? ""))
  );

  const f = rows[0].fields;
  const toNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
  const cost = {
    refrigerationFee: toNum(f["냉장료"]),
    inOutFee: toNum(f["입출고비"]),
    unionFee: toNum(f["노조비"]),
  };
  costCache.set(key, cost);
  return cost;
}

// ── 보관처 비용 이력 테이블 직접 조회 (냉장료 있는 행) ──────────────────────
async function debugCostTable() {
  const tbl = tableSegment(COST_TABLE);
  const fields = ["보관처명", "냉장료", "입출고비", "노조비", "적용시작일", "적용종료일"];
  const fieldsQs = fields.map((f) => `fields[]=${encodeURIComponent(f)}`).join("&");
  const formula = encodeURIComponent(`{냉장료}!=0`);
  const data = await airtableGet(`${tbl}?filterByFormula=${formula}&${fieldsQs}&pageSize=9`);
  return data.records ?? [];
}

// ── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {
  // ── 디버그 1: 보관처 비용 이력 테이블 — 냉장료 있는 행 직접 조회 ─────────
  console.log("\n📋 [DEBUG] 보관처 비용 이력 테이블 직접 조회 (냉장료 값 있는 행, 최대 9건)");
  try {
    const costRows = await debugCostTable();
    if (!costRows.length) {
      console.log("   → 냉장료 값이 있는 행이 없습니다 (테이블이 비어있거나 필터 미적용)");
    } else {
      costRows.forEach((r, i) => {
        const f = r.fields;
        console.log(`   [${i + 1}] 보관처명="${f["보관처명"]}" | 냉장료=${f["냉장료"]} | 입출고비=${f["입출고비"]} | 노조비=${f["노조비"]} | 적용시작일=${f["적용시작일"]} ~ ${f["적용종료일"] ?? "현재"}`);
      });
    }
  } catch (e) {
    console.error("   → 조회 오류:", e.message);
  }

  console.log("\n🔍 LOT별 재고 전체 조회 중...");
  const all = await fetchAllLots();
  console.log(`   총 ${all.length}건 조회 완료`);

  const toProcess = all;
  console.log(`   처리 대상 레코드: ${toProcess.length}건 (전체 — 기존 값도 덮어쓰기)`);

  // ── 디버그 2: 첫 번째 LOT의 보관처+입고일자로 비용 이력 조회 원본 응답 ──
  const firstWithStorage = toProcess.find((r) => r.fields["보관처"] && r.fields["입고일자"]);
  if (firstWithStorage) {
    const f = firstWithStorage.fields;
    const storage = String(f["보관처"]).trim();
    const inboundDate = String(f["입고일자"]).trim();
    console.log(`\n📋 [DEBUG] 첫 번째 유효 LOT 비용 이력 조회`);
    console.log(`   LOT번호: ${f["LOT번호"] ?? firstWithStorage.id}`);
    console.log(`   보관처: "${storage}" | 입고일자: "${inboundDate}"`);
    try {
      const tbl = tableSegment(COST_TABLE);
      const esc = storage.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const formula = `AND({보관처명}="${esc}",NOT(IS_AFTER({적용시작일},"${inboundDate}")),OR({적용종료일}="",NOT(IS_BEFORE({적용종료일},"${inboundDate}"))))`;
      const fieldsQs = ["보관처명","적용시작일","적용종료일","냉장료","입출고비","노조비"]
        .map((f) => `fields[]=${encodeURIComponent(f)}`).join("&");
      const data = await airtableGet(`${tbl}?filterByFormula=${encodeURIComponent(formula)}&${fieldsQs}&pageSize=5`);
      const rows = data.records ?? [];
      console.log(`   → 조회 결과: ${rows.length}건`);
      rows.forEach((r, i) => {
        console.log(`     [${i+1}]`, JSON.stringify(r.fields));
      });
      if (!rows.length) console.log("   → 매칭 행 없음 (보관처명 불일치 또는 날짜 범위 밖)");
    } catch (e) {
      console.error("   → 조회 오류:", e.message);
    }
  } else {
    console.log("\n📋 [DEBUG] 보관처+입고일자 모두 있는 LOT가 없습니다.");
  }
  console.log("");

  let skipped = 0, success = 0, failed = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const rec = toProcess[i];
    const f = rec.fields;
    const lot = String(f["LOT번호"] ?? rec.id);
    const storage = String(f["보관처"] ?? "").trim();
    const inboundDate = String(f["입고일자"] ?? "").trim();

    if (!storage || !inboundDate) {
      console.log(`  [${i + 1}/${toProcess.length}] ⏭️  ${lot} — 보관처 또는 입고일자 없음, 건너뜀`);
      skipped++;
      continue;
    }

    try {
      const cost = await getStorageCost(storage, inboundDate);
      if (!cost) {
        console.log(`  [${i + 1}/${toProcess.length}] ⏭️  ${lot} — 비용 이력 없음 (보관처: ${storage}, 입고일자: ${inboundDate})`);
        skipped++;
        continue;
      }

      const patch = {};
      if (cost.refrigerationFee != null) patch["냉장료단가"] = cost.refrigerationFee;
      if (cost.inOutFee != null) patch["입출고비"] = cost.inOutFee;
      if (cost.unionFee != null) patch["노조비"] = cost.unionFee;

      if (!Object.keys(patch).length) {
        console.log(`  [${i + 1}/${toProcess.length}] ⏭️  ${lot} — 이력에 값 없음 (냉장료/입출고비/노조비 모두 null)`);
        skipped++;
        continue;
      }

      await airtablePatch(tableSegment(LOT_TABLE), rec.id, patch);
      console.log(`  [${i + 1}/${toProcess.length}] ✅ ${lot} — 업데이트: ${JSON.stringify(patch)}`);
      success++;
    } catch (e) {
      console.error(`  [${i + 1}/${toProcess.length}] ❌ ${lot} — 오류: ${e.message}`);
      failed++;
    }

    // 5건마다 rate limit 대기
    if ((i + 1) % 5 === 0) await sleep(250);
  }

  console.log(`\n✅ 완료 — 성공: ${success} / 건너뜀: ${skipped} / 실패: ${failed} / 전체 대상: ${toProcess.length}`);
}

main().catch((e) => { console.error("스크립트 오류:", e); process.exit(1); });
