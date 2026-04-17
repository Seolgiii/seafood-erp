/**
 * 입고일 입력(클라이언트). 표시는 YYYY/MM/DD, API는 YYYY-MM-DD.
 */

function seoulYmdParts(): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
  }
  return { y, m, d };
}

export function getSeoulTodaySlash(): string {
  const { y, m, d } = seoulYmdParts();
  return `${y}/${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}`;
}

export function getSeoulTodayISO(): string {
  const { y, m, d } = seoulYmdParts();
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** `YYYY-MM-DD` → 화면 표시 `YYYY/MM/DD`. 형식이 아니면 원문 반환. */
export function isoDateToSlashDisplay(iso: string): string {
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[1]}/${m[2]}/${m[3]}`;
}

function isValidYmd(y: number, mo: number, day: number): boolean {
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(day))
    return false;
  if (mo < 1 || mo > 12 || day < 1 || day > 31) return false;
  const dt = new Date(y, mo - 1, day);
  return (
    dt.getFullYear() === y &&
    dt.getMonth() === mo - 1 &&
    dt.getDate() === day
  );
}

function toSlashIso(y: number, mo: number, day: number): {
  slash: string;
  iso: string;
} {
  const mm = String(mo).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return { slash: `${y}/${mm}/${dd}`, iso: `${y}-${mm}-${dd}` };
}

/**
 * onBlur: 8자리 전체연월일, 6자리 YYMMDD, 4자리 MMDD(올해 서울),
 * 또는 YYYY/M/D 등 구분자 형식. 실패 시 null.
 */
export function tryParseInboundDateInput(raw: string): {
  slash: string;
  iso: string;
} | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const slashMatch = trimmed.match(
    /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/
  );
  if (slashMatch) {
    const y = Number(slashMatch[1]);
    const mo = Number(slashMatch[2]);
    const day = Number(slashMatch[3]);
    if (isValidYmd(y, mo, day)) return toSlashIso(y, mo, day);
    return null;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (!/^\d+$/.test(digits)) return null;

  const { y: cy } = seoulYmdParts();

  if (digits.length === 8) {
    const y = Number(digits.slice(0, 4));
    const mo = Number(digits.slice(4, 6));
    const day = Number(digits.slice(6, 8));
    if (isValidYmd(y, mo, day)) return toSlashIso(y, mo, day);
    return null;
  }

  if (digits.length === 6) {
    const yy = Number(digits.slice(0, 2));
    const mo = Number(digits.slice(2, 4));
    const day = Number(digits.slice(4, 6));
    const y = 2000 + yy;
    if (isValidYmd(y, mo, day)) return toSlashIso(y, mo, day);
    return null;
  }

  if (digits.length === 4) {
    const mo = Number(digits.slice(0, 2));
    const day = Number(digits.slice(2, 4));
    if (isValidYmd(cy, mo, day)) return toSlashIso(cy, mo, day);
    return null;
  }

  return null;
}
