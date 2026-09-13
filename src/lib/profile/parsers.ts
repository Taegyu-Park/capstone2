/**
 * 문자열 값 파싱 유틸. CSV는 모든 값이 문자열로 들어오므로 여기서 숫자/날짜/불리언 여부를 판정한다.
 */

const MISSING_TOKENS = new Set([
  "",
  "na",
  "n/a",
  "null",
  "none",
  "-",
  "nan",
  "결측",
  "없음",
]);

export function isMissing(raw: string | null | undefined): boolean {
  if (raw === null || raw === undefined) return true;
  return MISSING_TOKENS.has(raw.trim().toLowerCase());
}

/** "1,234.5" 같은 천단위 구분자 표기를 허용하는 관대한 숫자 파서 */
export function parseNumberLoose(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  // 통화 기호, 공백, 천단위 콤마 제거. 부호와 소수점, 지수표기는 유지.
  const cleaned = trimmed.replace(/[,\s₩$%]/g, "");
  if (cleaned === "" || !/^[+-]?\d*\.?\d+(e[+-]?\d+)?$/i.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const BOOL_TRUE = new Set(["true", "yes", "y", "참", "예"]);
const BOOL_FALSE = new Set(["false", "no", "n", "거짓", "아니오"]);

export function parseBooleanLoose(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (BOOL_TRUE.has(v)) return true;
  if (BOOL_FALSE.has(v)) return false;
  return null;
}

const DATE_LIKE_RE = /^\d{4}[-./]\d{1,2}[-./]\d{1,2}([ T]\d{1,2}:\d{2}(:\d{2})?)?$/;
const COMPACT_DATE_RE = /^\d{8}$/; // YYYYMMDD

/** 날짜로 "보이는" 형태만 시도한다 — 순수 숫자(예: 카테고리 코드)를 날짜로 오인하지 않기 위함 */
export function parseDateLoose(raw: string): Date | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  if (COMPACT_DATE_RE.test(trimmed)) {
    const y = Number(trimmed.slice(0, 4));
    const m = Number(trimmed.slice(4, 6));
    const d = Number(trimmed.slice(6, 8));
    const date = new Date(Date.UTC(y, m - 1, d));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (!DATE_LIKE_RE.test(trimmed)) return null;

  const normalized = trimmed.replace(/\./g, "-").replace(/\//g, "-");
  const date = new Date(normalized.includes("T") || normalized.includes(" ") ? normalized : `${normalized}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function quantile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return NaN;
  const pos = (sortedAsc.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sortedAsc[base + 1] !== undefined) {
    return sortedAsc[base] + rest * (sortedAsc[base + 1] - sortedAsc[base]);
  }
  return sortedAsc[base];
}

export function mean(values: number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function stddev(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((acc, v) => acc + (v - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** 표본 왜도 (Fisher-Pearson, 보정 없음 — 근사치로 충분) */
export function skewness(values: number[], avg: number, sd: number): number {
  if (values.length < 3 || sd === 0) return 0;
  const n = values.length;
  const m3 = values.reduce((acc, v) => acc + ((v - avg) / sd) ** 3, 0) / n;
  return m3;
}
