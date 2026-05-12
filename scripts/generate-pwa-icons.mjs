/**
 * PWA 아이콘 일괄 생성 스크립트
 *
 * 원본: public/icons/apple-touch-icon.png (최초 4096×4096) 또는
 *       이미 백업이 있으면 public/icons/source-4096.png
 *
 * 생성:
 *   public/icons/source-4096.png      — 원본 백업 (최초 1회)
 *   public/icons/icon-192.png         — 192×192 (Android Chrome installability)
 *   public/icons/icon-512.png         — 512×512 (Android Chrome installability / splash)
 *   public/icons/apple-touch-icon.png — 180×180 (manifest 선언과 일치, iOS)
 *   app/icon.png                      — 32×32 (Next.js App Router favicon 자동 감지)
 *
 * 사용:
 *   node scripts/generate-pwa-icons.mjs
 *
 * 원본 디자인 변경 시:
 *   1. source-4096.png를 새 4096×4096 원본으로 교체
 *   2. 위 명령 재실행
 */

import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const APPLE_ICON = path.join(ROOT, "public/icons/apple-touch-icon.png");
const SOURCE_BACKUP = path.join(ROOT, "public/icons/source-4096.png");

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function ensureSource() {
  if (await fileExists(SOURCE_BACKUP)) {
    return SOURCE_BACKUP;
  }
  if (!(await fileExists(APPLE_ICON))) {
    throw new Error(
      `원본 아이콘을 찾을 수 없습니다. 다음 중 하나가 필요합니다:\n` +
        ` - ${SOURCE_BACKUP}\n - ${APPLE_ICON}`,
    );
  }
  const buf = await fs.readFile(APPLE_ICON);
  const meta = await sharp(buf).metadata();
  console.log(
    `[icons] 원본 메타: ${meta.width}×${meta.height}, ${(buf.length / 1024).toFixed(1)}KB`,
  );
  await fs.writeFile(SOURCE_BACKUP, buf);
  console.log(`[icons] 원본 백업 → ${path.relative(ROOT, SOURCE_BACKUP)}`);
  return SOURCE_BACKUP;
}

async function resize(src, size, outRel) {
  const out = path.join(ROOT, outRel);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await sharp(src).resize(size, size).png({ compressionLevel: 9 }).toFile(out);
  const stat = await fs.stat(out);
  console.log(
    `[icons] ${outRel.padEnd(34)} ${size}×${size}  ${(stat.size / 1024).toFixed(1)}KB`,
  );
}

async function main() {
  const source = await ensureSource();
  const src = await fs.readFile(source);

  await resize(src, 192, "public/icons/icon-192.png");
  await resize(src, 512, "public/icons/icon-512.png");
  await resize(src, 180, "public/icons/apple-touch-icon.png");
  await resize(src, 32, "app/icon.png");

  console.log("\n[icons] 완료");
}

main().catch((e) => {
  console.error("[icons] 실패:", e.message);
  process.exit(1);
});
