import "server-only";
import crypto from "node:crypto";

/**
 * PIN 해시화 — Node.js 내장 scrypt 사용 (외부 의존성 0)
 *
 * 저장 형식: `scrypt:<saltHex>:<hashHex>`
 *  - 평문 PIN과 구분 가능 (4자리 숫자가 아님)
 *  - salt는 레코드별 다름 → rainbow table 무력화
 *  - timing-safe 비교로 부채널 공격 방어
 */

const HASH_PREFIX = "scrypt:";

// OWASP 권장 minimum 충족. Vercel serverless에서 ~50ms.
const SCRYPT_N = 16384; // 2^14
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SALT_LEN = 16;
const KEY_LEN = 32;

function scryptAsync(
  password: string,
  salt: Buffer,
  keyLen: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      keyLen,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P },
      (err, derived) => {
        if (err) reject(err);
        else resolve(derived as Buffer);
      },
    );
  });
}

/** 평문 PIN을 저장용 해시 문자열로 변환 */
export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_LEN);
  const derived = await scryptAsync(pin, salt, KEY_LEN);
  return `${HASH_PREFIX}${salt.toString("hex")}:${derived.toString("hex")}`;
}

/** stored 문자열이 해시 형식인지 (평문 PIN과 구분) */
export function isHashedPin(stored: string): boolean {
  return typeof stored === "string" && stored.startsWith(HASH_PREFIX);
}

/** 입력 PIN과 저장된 해시를 timing-safe 비교 */
export async function verifyHashedPin(
  pin: string,
  stored: string,
): Promise<boolean> {
  if (!isHashedPin(stored)) return false;
  const rest = stored.slice(HASH_PREFIX.length);
  const sep = rest.indexOf(":");
  if (sep < 0) return false;
  const saltHex = rest.slice(0, sep);
  const hashHex = rest.slice(sep + 1);
  if (!saltHex || !hashHex) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltHex, "hex");
    expected = Buffer.from(hashHex, "hex");
  } catch {
    return false;
  }
  if (salt.length !== SALT_LEN || expected.length === 0) return false;

  const derived = await scryptAsync(pin, salt, expected.length);
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}
