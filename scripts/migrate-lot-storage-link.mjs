/**
 * LOT별 재고 보관처 Link 마이그레이션
 *
 * LOT별 재고.보관처 필드를 Link로 변경한 후 비어있는 레코드를
 * 입고관리.보관처 Link에서 복사하여 채웁니다.
 *
 * 실행:
 *   node scripts/migrate-lot-storage-link.mjs           (dry-run)
 *   node scripts/migrate-lot-storage-link.mjs --execute
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
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
const HEADERS = {
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
};

const LOT_TABLE = "LOT별 재고";
const INBOUND_TABLE = env.AIRTABLE_INBOUND_TABLE?.trim() || "입고 관리";
const LOT_TO_INBOUND_FIELD = env.AIRTABLE_LOT_TO_INBOUND_FIELD?.trim() || "입고관리링크";

// 보관처 link가 비어있는 LOT별 재고 레코드 전부 fetch
async function fetchTargetLots() {
  const records = [];
  let offset;
  do {
    const params = new URLSearchParams({
      filterByFormula: `NOT({보관처})`,
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

// 입고관리 레코드에서 보관처 link ID 가져오기 (중복 호출 방지 캐시)
const inboundStorageCache = new Map();
async function getInboundStorageId(inboundRecordId) {
  if (inboundStorageCache.has(inboundRecordId)) {
    return inboundStorageCache.get(inboundRecordId);
  }
  const url = `${API}/${BASE_ID}/${encodeURIComponent(INBOUND_TABLE)}/${inboundRecordId}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    inboundStorageCache.set(inboundRecordId, null);
    return null;
  }
  const data = await res.json();
  const raw = data.fields?.["보관처"];
  const storageId = Array.isArray(raw) && raw.length > 0 ? raw[0] : null;
  inboundStorageCache.set(inboundRecordId, storageId);
  return storageId;
}

async function main() {
  console.log(`[migrate-lot-storage] 모드: ${DRY_RUN ? "DRY RUN (실제 변경 없음)" : "EXECUTE (실제 적용)"}`);
  console.log(`[migrate-lot-storage] 보관처 link 비어있는 LOT별 재고 fetch 중...\n`);

  const lots = await fetchTargetLots();
  console.log(`[migrate-lot-storage] 대상: ${lots.length}건\n`);

  if (lots.length === 0) {
    console.log("[migrate-lot-storage] 마이그레이션 대상 없음. 종료.");
    return;
  }

  if (DRY_RUN) {
    const preview = lots.slice(0, 5);
    console.log(`[migrate-lot-storage] === DRY RUN 미리보기 (${preview.length}/${lots.length}건) ===`);
    for (const lot of preview) {
      const inboundId = lot.fields?.[LOT_TO_INBOUND_FIELD]?.[0];
      const storageId = inboundId ? await getInboundStorageId(inboundId) : null;
      console.log(`\n--- LOT id=${lot.id}, 번호=${lot.fields?.["LOT번호"] ?? "(없음)"} ---`);
      console.log(`  입고관리링크: ${inboundId ?? "(없음)"}`);
      console.log(`  보관처 record id → ${storageId ?? "(매핑 없음 — 입고관리에 보관처 없음)"}`);
    }
    console.log(`\n[migrate-lot-storage] 실제 실행: node scripts/migrate-lot-storage-link.mjs --execute`);
    return;
  }

  let success = 0, skipped = 0, failed = 0;
  const failures = [];

  for (let i = 0; i < lots.length; i++) {
    const lot = lots[i];
    const inboundId = lot.fields?.[LOT_TO_INBOUND_FIELD]?.[0];

    if (!inboundId) {
      skipped++;
      console.warn(`  [skip] LOT id=${lot.id} (번호=${lot.fields?.["LOT번호"]}): 입고관리링크 없음`);
      await new Promise((r) => setTimeout(r, 220));
      continue;
    }

    const storageId = await getInboundStorageId(inboundId);
    if (!storageId) {
      skipped++;
      console.warn(`  [skip] LOT id=${lot.id} (번호=${lot.fields?.["LOT번호"]}): 입고관리에 보관처 없음`);
      await new Promise((r) => setTimeout(r, 220));
      continue;
    }

    try {
      const patchRes = await fetch(
        `${API}/${BASE_ID}/${encodeURIComponent(LOT_TABLE)}/${lot.id}`,
        {
          method: "PATCH",
          headers: HEADERS,
          body: JSON.stringify({ fields: { 보관처: [storageId] } }),
        }
      );
      if (!patchRes.ok) {
        const body = await patchRes.text().catch(() => "");
        throw new Error(`PATCH 실패 ${patchRes.status}: ${body}`);
      }
      success++;
      if ((i + 1) % 10 === 0 || i === lots.length - 1) {
        console.log(`[migrate-lot-storage] 진행 ${i + 1}/${lots.length} (성공 ${success}, 스킵 ${skipped}, 실패 ${failed})`);
      }
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      failures.push({ lotId: lot.id, lotNumber: lot.fields?.["LOT번호"], error: msg });
      console.error(`[migrate-lot-storage] LOT id=${lot.id} 실패: ${msg}`);
    }

    // Airtable rate limit: 220ms 간격
    await new Promise((r) => setTimeout(r, 220));
  }

  console.log(`\n[migrate-lot-storage] === 완료 ===`);
  console.log(`[migrate-lot-storage] 성공: ${success}건 / 스킵: ${skipped}건 / 실패: ${failed}건`);
  if (failures.length > 0) {
    console.log("\n[migrate-lot-storage] 실패 상세:");
    for (const f of failures) {
      console.log(`  - LOT id=${f.lotId} (번호=${f.lotNumber}): ${f.error}`);
    }
  }
}

main().catch((e) => {
  console.error("[migrate-lot-storage] 치명적 오류:", e);
  process.exit(1);
});
