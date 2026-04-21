/**
 * LOT번호 일괄 생성 스크립트
 *
 * LOT별 재고 테이블에서 LOT번호가 비어있는 레코드에 LOT번호를 생성합니다.
 * 형식: YYMMDD-품목코드-규격-[미수숫자-]전체일련번호(4자리)
 *   - 미수 끝 "미" 제거 (26미→26), 비어있으면 세그먼트 생략
 *   - 일련번호: 기존 LOT번호 전체에서 가장 큰 값 + 1부터 순차 부여
 *   - 날짜: 해당 레코드의 입고일자(YYYY-MM-DD) 사용
 *
 * 부산물: scripts/product-code-map.json (품목명→품목코드 매핑)
 *
 * 실행: node scripts/backfill-lot-numbers.mjs
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

const DRY_RUN = process.argv.includes("--dry-run");

const API = "https://api.airtable.com/v0";
const LOT_TABLE  = env.AIRTABLE_LOT_TABLE?.trim()  || "LOT별 재고";
const PROD_TABLE = "품목마스터";

// 품목마스터에 아직 코드가 없지만 수동으로 확정된 매핑
const MANUAL_CODE_OVERRIDES = new Map([
  ["삼치",       "SM1"],
  ["사고시 사료", "FSM"],
  ["아귀 사료",  "FAF"],
]);

// LOT번호 생성을 건너뛸 품목명 (추후 별도 처리)
const SKIP_NAMES = new Set(["갈치"]);

const hdrs = () => ({ Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" });

function tableSegment(name) {
  return /^tbl[0-9a-zA-Z]+$/i.test(name) ? name : encodeURIComponent(name);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Airtable 유틸 ─────────────────────────────────────────────────────────────
async function airtableGet(urlPath) {
  const res = await fetch(`${API}/${BASE_ID}/${urlPath}`, { headers: hdrs() });
  if (!res.ok) throw new Error(`GET ${urlPath} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function airtablePatch(tableSeg, recordId, fields) {
  const res = await fetch(`${API}/${BASE_ID}/${tableSeg}/${recordId}`, {
    method: "PATCH",
    headers: hdrs(),
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`PATCH ${recordId} → ${res.status}: ${await res.text()}`);
}

// ── 전체 페이지네이션 조회 ─────────────────────────────────────────────────────
async function fetchAll(tableSeg, fieldNames) {
  const fieldsQs = fieldNames.map((f) => `fields[]=${encodeURIComponent(f)}`).join("&");
  const records = [];
  let offset = "";
  do {
    const offsetQs = offset ? `&offset=${encodeURIComponent(offset)}` : "";
    const data = await airtableGet(`${tableSeg}?pageSize=100&${fieldsQs}${offsetQs}`);
    records.push(...(data.records ?? []));
    offset = data.offset ?? "";
    if (offset) await sleep(250);
  } while (offset);
  return records;
}

// ── LOT번호 생성 (buildLotNumber 동일 로직) ────────────────────────────────────
function buildLotNumber({ bizDate, productCode, spec, misu, seq }) {
  const yymmdd = normalizeDate(bizDate).replace(/-/g, "").slice(2);
  const seqStr = String(seq).padStart(4, "0");
  const misuClean = misu.replace(/미$/, "").trim();
  const parts = [yymmdd, productCode || "NOCODE", spec || "-"];
  if (misuClean) parts.push(misuClean);
  parts.push(seqStr);
  return parts.join("-");
}

// "2026.4.17" / "2026/4/17" / "2026-4-17" → "2026-04-17"
function normalizeDate(raw) {
  const s = String(raw ?? "").trim().replace(/[./]/g, "-").replace(/\s/g, "");
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return s;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

// ── 기존 LOT번호에서 최대 일련번호 추출 ──────────────────────────────────────
function extractMaxSeq(allLots) {
  let max = 0;
  for (const rec of allLots) {
    const m = String(rec.fields?.["LOT번호"] ?? "").match(/-(\d{4})$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

// ── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {
  // 1. LOT별 재고 전체 조회
  console.log("🔍 LOT별 재고 전체 조회 중...");
  const lotTbl = tableSegment(LOT_TABLE);
  const allLots = await fetchAll(lotTbl, ["LOT번호", "품목명", "규격", "미수", "입고일자"]);
  console.log(`   총 ${allLots.length}건 조회 완료`);

  const emptyLots = allLots.filter((r) => !String(r.fields?.["LOT번호"] ?? "").trim());
  console.log(`   LOT번호 비어있는 레코드: ${emptyLots.length}건\n`);

  if (!emptyLots.length) {
    console.log("✅ LOT번호가 비어있는 레코드가 없습니다.");
    return;
  }

  // 2. 품목마스터 → 품목코드 매핑
  console.log("🏷️  품목마스터에서 품목코드 매핑 조회 중...");
  const prodRecs = await fetchAll(tableSegment(PROD_TABLE), ["품목명", "품목코드"]);
  /** @type {Map<string, string>} */
  const productCodeMap = new Map();
  for (const rec of prodRecs) {
    const name = String(rec.fields?.["품목명"] ?? "").trim();
    const code = String(rec.fields?.["품목코드"] ?? "").trim();
    if (name) productCodeMap.set(name, code);
  }
  // 수동 확정 코드 덮어쓰기 (Airtable에 아직 미반영된 신규 코드 포함)
  for (const [name, code] of MANUAL_CODE_OVERRIDES) {
    productCodeMap.set(name, code);
  }
  console.log(`   품목 ${productCodeMap.size}건 매핑 완료 (수동 오버라이드 ${MANUAL_CODE_OVERRIDES.size}건 포함)`);

  // 매핑 파일 저장
  const mapObj = Object.fromEntries(
    [...productCodeMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "ko"))
      .map(([name, code]) => [name, code || "(코드 없음)"])
  );
  const mapPath = path.resolve(__dirname, "product-code-map.json");
  fs.writeFileSync(mapPath, JSON.stringify(mapObj, null, 2), "utf8");
  console.log(`   매핑 파일 저장: scripts/product-code-map.json\n`);

  // 3. 최대 일련번호 파악
  const maxSeq = extractMaxSeq(allLots);
  let nextSeq = maxSeq + 1;
  console.log(`   기존 최대 일련번호: ${String(maxSeq).padStart(4, "0")} → 시작 번호: ${String(nextSeq).padStart(4, "0")}\n`);

  // 미등록 품목명 경고 (실행 전 한 번에 출력)
  const unknownNames = [...new Set(
    emptyLots
      .map((r) => String(r.fields?.["품목명"] ?? "").trim())
      .filter((n) => n && !productCodeMap.get(n))
  )];
  if (unknownNames.length) {
    console.warn(`⚠️  품목코드 매핑 없음 (NOCODE 처리) — 품목명: ${unknownNames.join(", ")}\n`);
  }

  // 4. 빈 LOT에 번호 부여
  if (DRY_RUN) console.log("🔎 DRY-RUN 모드: Airtable PATCH 없이 생성될 LOT번호만 출력합니다.\n");
  let success = 0, skipped = 0, failed = 0;

  for (let i = 0; i < emptyLots.length; i++) {
    const rec = emptyLots[i];
    const f = rec.fields ?? {};
    const productName = String(f["품목명"] ?? "").trim();
    const spec        = String(f["규격"]   ?? "").trim();
    const misu        = String(f["미수"]   ?? "").trim();
    const rawDate     = String(f["입고일자"] ?? "").trim();

    if (SKIP_NAMES.has(productName)) {
      console.log(`  [${i + 1}/${emptyLots.length}] ⏭️  건너뜀(스킵 품목) — ${productName} / 규격:${spec || "-"} / 미수:${misu || "-"}`);
      skipped++;
      continue;
    }

    if (!rawDate) {
      console.log(`  [${i + 1}/${emptyLots.length}] ⏭️  ${rec.id} — 입고일자 없음, 건너뜀 (품목명: ${productName || "(없음)"})`);
      skipped++;
      continue;
    }

    const productCode = productCodeMap.get(productName) ?? "";
    const lotNumber = buildLotNumber({
      bizDate: rawDate,
      productCode,
      spec,
      misu,
      seq: nextSeq,
    });

    if (DRY_RUN) {
      console.log(`  [${i + 1}/${emptyLots.length}] 🔎 ${lotNumber}  (${productName} / 규격:${spec || "-"} / 미수:${misu || "-"})`);
      nextSeq++;
      success++;
    } else {
      try {
        await airtablePatch(lotTbl, rec.id, { "LOT번호": lotNumber });
        console.log(`  [${i + 1}/${emptyLots.length}] ✅ ${lotNumber}  (${productName} / 규격:${spec || "-"} / 미수:${misu || "-"})`);
        nextSeq++;
        success++;
      } catch (e) {
        console.error(`  [${i + 1}/${emptyLots.length}] ❌ ${rec.id} — 오류: ${e.message}`);
        failed++;
      }
    }

    if ((i + 1) % 5 === 0) await sleep(250);
  }

  console.log(`\n✅ 완료 — 성공: ${success} / 건너뜀: ${skipped} / 실패: ${failed} / 전체 대상: ${emptyLots.length}`);
  console.log(`   최종 일련번호: ${String(nextSeq - 1).padStart(4, "0")}`);
}

main().catch((e) => { console.error("스크립트 오류:", e); process.exit(1); });
