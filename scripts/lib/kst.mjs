// 모든 날짜 경계는 KST(UTC+9, 서머타임 없음) 기준입니다.
const KST_OFFSET = '+09:00';

/** UTC 기준 Date를 KST 기준 'YYYY-MM-DD' 문자열로 변환합니다. */
export function toKstDate(date) {
  return new Date(date.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD'(KST)에 days를 더한 날짜 문자열을 돌려줍니다. */
export function addDays(dateStr, days) {
  const base = new Date(`${dateStr}T00:00:00${KST_OFFSET}`);
  return toKstDate(new Date(base.getTime() + days * 86400 * 1000));
}

/** 지금(KST) 기준 '어제' 날짜 문자열. */
export function yesterdayKst(now = new Date()) {
  return addDays(toKstDate(now), -1);
}

/** KST 하루의 시작/끝을 UTC Date로 돌려줍니다. end는 배타적입니다. */
export function kstDayRange(dateStr) {
  const start = new Date(`${dateStr}T00:00:00${KST_OFFSET}`);
  return { start, end: new Date(start.getTime() + 86400 * 1000) };
}

/** 'YYYY-MM-DD' 형식인지 확인하고, 아니면 예외를 던집니다. */
export function assertDateStr(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error(`날짜 형식이 올바르지 않습니다(YYYY-MM-DD 필요): ${dateStr}`);
  }
  return dateStr;
}

/** ISO 시각을 KST 'HH:MM'으로 표시합니다. */
export function toKstTime(iso) {
  return new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(11, 16);
}
