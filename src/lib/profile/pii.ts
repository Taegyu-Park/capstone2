/**
 * PII(개인식별정보) 자동 감지 + 마스킹.
 * 설계 근거: PLAN.md §9.2 — 통계 요약은 그대로 두고 "실제 값이 노출되는 자리"만 마스킹한다
 * (sampleRows, categorical.topValues, text.samples).
 */

const PII_COLUMN_NAME_RE =
  /(이름|성명|name|email|e-mail|메일|전화|휴대폰|연락처|phone|tel|주민|주민등록|ssn|카드|card|주소|address|생년월일|dob|birth)/i;

const EMAIL_RE = /^[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}$/;
const PHONE_RE = /^0\d{1,2}-?\d{3,4}-?\d{4}$/;
const RRN_RE = /^\d{6}-?\d{7}$/; // 주민등록번호 형태 (YYMMDD-XXXXXXX)
const CARD_RE = /^\d{4}-?\d{4}-?\d{4}-?\d{4}$/;

export type PiiValueKind = "email" | "phone" | "rrn" | "card" | "generic";

function detectValueKind(raw: string): PiiValueKind | null {
  const v = raw.trim();
  if (EMAIL_RE.test(v)) return "email";
  if (RRN_RE.test(v)) return "rrn";
  if (CARD_RE.test(v)) return "card";
  if (PHONE_RE.test(v)) return "phone";
  return null;
}

/**
 * 컬럼이 PII로 의심되는지 판정한다.
 * - 컬럼명이 PII 패턴에 매치하거나
 * - 비결측 샘플 값의 절반 이상이 이메일/전화/주민번호/카드번호 형태에 매치하면 true.
 */
export function detectPiiColumn(columnName: string, sampleValues: string[]): boolean {
  if (PII_COLUMN_NAME_RE.test(columnName)) return true;

  const nonEmpty = sampleValues.filter((v) => v.trim() !== "");
  if (nonEmpty.length === 0) return false;

  const hits = nonEmpty.filter((v) => detectValueKind(v) !== null).length;
  return hits / nonEmpty.length >= 0.5;
}

function maskEmail(raw: string): string {
  const [local, domain] = raw.split("@");
  if (!domain) return maskGeneric(raw);
  const maskedLocal = local.length <= 2 ? `${local[0] ?? ""}*` : `${local.slice(0, 2)}${"*".repeat(Math.max(local.length - 2, 1))}`;
  const domainParts = domain.split(".");
  const tld = domainParts.pop() ?? "";
  const maskedDomain = `${"*".repeat(Math.max(domainParts.join(".").length, 1))}.${tld}`;
  return `${maskedLocal}@${maskedDomain}`;
}

function maskPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 4) return "*".repeat(raw.length);
  const prefixLen = digits.length > 10 ? 3 : 2; // 010/011 등 국번 자릿수
  const prefix = digits.slice(0, prefixLen);
  const last4 = digits.slice(-4);
  return `${prefix}-****-${last4}`;
}

function maskRrn(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const birthPart = digits.slice(0, 6);
  return `${birthPart}-${"*".repeat(7)}`;
}

function maskCard(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const last4 = digits.slice(-4);
  return `****-****-****-${last4}`;
}

/** 특정 패턴을 못 찾았을 때의 폴백: 형태(길이)는 남기고 내용만 가린다 */
function maskGeneric(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length <= 1) return "*";
  if (trimmed.length <= 3) return `${trimmed[0]}${"*".repeat(trimmed.length - 1)}`;
  return `${trimmed.slice(0, 1)}${"*".repeat(trimmed.length - 2)}${trimmed.slice(-1)}`;
}

/** PII로 판정된 컬럼의 값 하나를 마스킹한다 */
export function maskPiiValue(raw: string): string {
  const kind = detectValueKind(raw) ?? "generic";
  switch (kind) {
    case "email":
      return maskEmail(raw);
    case "phone":
      return maskPhone(raw);
    case "rrn":
      return maskRrn(raw);
    case "card":
      return maskCard(raw);
    default:
      return maskGeneric(raw);
  }
}
