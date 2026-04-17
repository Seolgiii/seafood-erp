/**
 * 규격·미수(상세규격) UI/API 표기: `11kg (42/44미)` 형식.
 * DB 값은 그대로 두고 표시용으로만 접미사를 붙입니다.
 */
export function formatSpecKgMisu(specRaw: string, misuRaw: string): string {
  const specT = specRaw.trim();
  const misuT = misuRaw.trim();
  const spec = specT === "-" ? "" : specT;
  const misu = misuT === "-" ? "" : misuT;

  const specKg =
    spec === ""
      ? ""
      : /kg\s*$/i.test(spec)
        ? spec
        : `${spec}kg`;

  if (specKg && misu) return `${specKg} (${misu}미)`;
  if (specKg) return specKg;
  if (misu) return `(${misu}미)`;
  return "-";
}

/** LOT별 재고 등 레코드에서 규격·상세(미수) 필드명 차이를 흡수해 표시 한 줄로 만듭니다. */
export function firstLotStringField(
  fields: Record<string, unknown>,
  keys: readonly string[]
): string {
  for (const key of keys) {
    const v = fields[key];
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

export function formatLotSpecDisplayLine(
  fields: Record<string, unknown>
): string {
  const spec = firstLotStringField(fields, ["규격표시", "규격"]);
  const detail = firstLotStringField(fields, [
    "상세규격_표기",
    "상세규격",
    "미수",
  ]);
  return formatSpecKgMisu(spec, detail);
}
