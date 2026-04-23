// PWA 아이콘 생성 스크립트 (Node.js 내장 모듈만 사용)
import { writeFileSync, mkdirSync } from 'fs';
import { deflateSync } from 'zlib';

// ── PNG 인코더 ────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (const b of buf) crc = CRC_TABLE[(crc ^ b) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/** RGBA PNG 생성. drawPixel(x, y, size) → [R, G, B, A] */
function makePNG(size, drawPixel) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  // ihdr[10,11,12] = 0 (compression, filter, interlace)

  const raw = new Uint8Array(size * (1 + size * 4)); // filter + RGBA per row
  let pos = 0;
  for (let y = 0; y < size; y++) {
    raw[pos++] = 0; // filter None
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = drawPixel(x, y, size);
      raw[pos++] = r; raw[pos++] = g; raw[pos++] = b; raw[pos++] = a;
    }
  }

  const idat = deflateSync(Buffer.from(raw), { level: 9 });

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── 도형 헬퍼 ─────────────────────────────────────────────────────────────
function inEllipse(x, y, cx, cy, rx, ry) {
  return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
}

function inCircle(x, y, cx, cy, r) {
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function sign(px, py, ax, ay, bx, by) {
  return (px - bx) * (ay - by) - (ax - bx) * (py - by);
}

function inTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = sign(px, py, ax, ay, bx, by);
  const d2 = sign(px, py, bx, by, cx, cy);
  const d3 = sign(px, py, cx, cy, ax, ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

/** 둥근 모서리 안에 있는지 (normalized 0-1 좌표) */
function inRoundedRect(nx, ny, r) {
  const dx = Math.max(0, Math.abs(nx - 0.5) - (0.5 - r));
  const dy = Math.max(0, Math.abs(ny - 0.5) - (0.5 - r));
  return dx * dx + dy * dy <= r * r;
}

// ── 물고기 픽셀 렌더러 ────────────────────────────────────────────────────
// 물고기 방향: 왼쪽을 바라봄 (꼬리=오른쪽)
function drawFishIcon(x, y, size) {
  const nx = x / size; // 정규화 좌표 0-1
  const ny = y / size;

  const BG_R = 0x31, BG_G = 0x82, BG_B = 0xF6; // #3182F6
  const TRANSPARENT = [0, 0, 0, 0];
  const BLUE = [BG_R, BG_G, BG_B, 255];
  const WHITE = [255, 255, 255, 255];

  // 바깥 (둥근 모서리 밖) → 투명
  if (!inRoundedRect(nx, ny, 0.18)) return TRANSPARENT;

  // 물고기 몸통 타원
  const bodyIn = inEllipse(nx, ny, 0.42, 0.50, 0.27, 0.175);

  // 꼬리 (오른쪽 두 삼각형으로 구성된 V형)
  const tailTopIn = inTriangle(nx, ny, 0.67, 0.44, 0.89, 0.17, 0.89, 0.50);
  const tailBotIn = inTriangle(nx, ny, 0.67, 0.56, 0.89, 0.50, 0.89, 0.83);

  // 꼬리 중앙 오목 부분 (V형 홈) → 파란색으로 다시 덮음
  const tailNotchIn = inTriangle(nx, ny, 0.72, 0.50, 0.89, 0.33, 0.89, 0.67);

  // 등지느러미
  const finIn = inTriangle(nx, ny, 0.34, 0.325, 0.50, 0.18, 0.56, 0.325);

  // 눈 (흰 몸통 위에 파란 원)
  const eyeIn = inCircle(nx, ny, 0.24, 0.467, 0.038);

  const isWhite = (bodyIn || tailTopIn || tailBotIn || finIn) && !tailNotchIn;

  if (eyeIn && bodyIn) return BLUE;
  if (isWhite) return WHITE;
  return BLUE;
}

// ── 생성 ──────────────────────────────────────────────────────────────────
mkdirSync('public/icons', { recursive: true });

const sizes = [192, 512, 180]; // 180 = apple-touch-icon
for (const size of sizes) {
  const buf = makePNG(size, drawFishIcon);
  const name = size === 180 ? 'apple-touch-icon' : `icon-${size}`;
  writeFileSync(`public/icons/${name}.png`, buf);
  console.log(`✓ public/icons/${name}.png  (${buf.length} bytes)`);
}

console.log('\n아이콘 생성 완료!');
