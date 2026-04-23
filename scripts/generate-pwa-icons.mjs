// PWA 아이콘 생성 스크립트 (Node.js 내장 모듈만 사용)
// 4x MSAA 안티앨리어싱으로 부드러운 곡선 구현
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
  ihdr[8] = 8; ihdr[9] = 6; // 8bpp RGBA

  const raw = new Uint8Array(size * (1 + size * 4));
  let pos = 0;
  for (let y = 0; y < size; y++) {
    raw[pos++] = 0; // filter None
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = drawPixel(x, y, size);
      raw[pos++] = r; raw[pos++] = g; raw[pos++] = b; raw[pos++] = a;
    }
  }

  const idat = deflateSync(Buffer.from(raw), { level: 9 });
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

// ── 도형 헬퍼 (정규화 좌표 0-1) ──────────────────────────────────────────
function inEllipse(nx, ny, cx, cy, rx, ry) {
  return ((nx - cx) / rx) ** 2 + ((ny - cy) / ry) ** 2 <= 1;
}

function inCircle(nx, ny, cx, cy, r) {
  return (nx - cx) ** 2 + (ny - cy) ** 2 <= r * r;
}

function triSign(px, py, ax, ay, bx, by) {
  return (px - bx) * (ay - by) - (ax - bx) * (py - by);
}

function inTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = triSign(px, py, ax, ay, bx, by);
  const d2 = triSign(px, py, bx, by, cx, cy);
  const d3 = triSign(px, py, cx, cy, ax, ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

function inRoundedRect(nx, ny, r) {
  const dx = Math.max(0, Math.abs(nx - 0.5) - (0.5 - r));
  const dy = Math.max(0, Math.abs(ny - 0.5) - (0.5 - r));
  return dx * dx + dy * dy <= r * r;
}

// ── 물고기 픽셀 렌더러 ────────────────────────────────────────────────────
// 물고기 방향: 왼쪽(입) → 오른쪽(꼬리)
function drawFishPixel(nx, ny) {
  const BG  = [0x31, 0x82, 0xF6, 255]; // #3182F6
  const W   = [255, 255, 255, 255];
  const NONE = [0, 0, 0, 0];

  if (!inRoundedRect(nx, ny, 0.18)) return NONE;

  // 몸통 타원: center(0.42, 0.50), rx=0.265, ry=0.175
  const body = inEllipse(nx, ny, 0.42, 0.50, 0.265, 0.175);

  // 등지느러미: 몸통 위에 살짝 튀어나온 삼각형
  const fin = inTriangle(nx, ny, 0.34, 0.326, 0.50, 0.182, 0.57, 0.326);

  // ── 꼬리 (caudal fin) ─────────────────────────────────────────────────
  // 꼬리는 몸통 오른쪽(x≈0.62~0.90)에 위치
  // 위쪽 지느러미 로브: 넓게 펼쳐진 사각형(두 삼각형)
  const tailUpA = inTriangle(nx, ny, 0.63, 0.43, 0.67, 0.27, 0.91, 0.11);
  const tailUpB = inTriangle(nx, ny, 0.63, 0.43, 0.91, 0.11, 0.91, 0.41);
  // 아래쪽 지느러미 로브
  const tailDnA = inTriangle(nx, ny, 0.63, 0.57, 0.67, 0.73, 0.91, 0.89);
  const tailDnB = inTriangle(nx, ny, 0.63, 0.57, 0.91, 0.89, 0.91, 0.59);

  // V형 홈(notch): 꼬리 중앙을 파란색으로 도려냄 → 자연스러운 갈라진 꼬리
  // 홈을 깊고 넓게 만들어 두 로브가 명확히 구분되도록
  const notch = inTriangle(nx, ny, 0.66, 0.50, 0.91, 0.395, 0.91, 0.605);

  // 눈: 흰 몸통 위에 파란 원
  const eye = inCircle(nx, ny, 0.245, 0.468, 0.038);

  const isTail = (tailUpA || tailUpB || tailDnA || tailDnB) && !notch;
  const isWhite = body || isTail || fin;

  if (eye && body) return BG;
  if (isWhite) return W;
  return BG;
}

// ── 4x MSAA 안티앨리어싱 래퍼 ────────────────────────────────────────────
// 픽셀당 2×2 서브픽셀 샘플링으로 계단 현상 제거
function drawFishIconAA(px, py, size) {
  const OFFSETS = [0.25, 0.75];
  let R = 0, G = 0, B = 0, A = 0;
  for (const ox of OFFSETS) {
    for (const oy of OFFSETS) {
      const [r, g, b, a] = drawFishPixel((px + ox) / size, (py + oy) / size);
      R += r; G += g; B += b; A += a;
    }
  }
  return [R / 4, G / 4, B / 4, A / 4];
}

// ── 생성 ──────────────────────────────────────────────────────────────────
mkdirSync('public/icons', { recursive: true });

for (const size of [192, 512]) {
  const buf = makePNG(size, (x, y, s) => drawFishIconAA(x, y, s));
  writeFileSync(`public/icons/icon-${size}.png`, buf);
  console.log(`✓ public/icons/icon-${size}.png  (${buf.length} bytes)`);
}

const apple = makePNG(180, (x, y, s) => drawFishIconAA(x, y, s));
writeFileSync('public/icons/apple-touch-icon.png', apple);
console.log(`✓ public/icons/apple-touch-icon.png  (${apple.length} bytes)`);

console.log('\n아이콘 생성 완료!');
