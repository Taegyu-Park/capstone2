/**
 * config.exclude 규칙으로 제목을 걸러내는 함수를 만듭니다.
 * 정규식 대신 구조화된 규칙을 쓰므로 config에 이스케이프가 필요 없습니다.
 */
export function makeExcluder(exclude = {}) {
  const tags = (exclude.bracketTags || []).map((t) => t.toLowerCase());
  const contains = (exclude.titleContains || []).map((t) => t.toLowerCase());
  const startsWith = (exclude.titleStartsWith || []).map((t) => t.toLowerCase());

  return function isExcluded(rawTitle) {
    const title = String(rawTitle || '').trim();
    const lower = title.toLowerCase();

    // "[태그] 본문" 형태에서 대괄호 안을 꺼내 비교합니다.
    const bracket = title.match(/^\[([^\]]{1,30})\]/);
    if (bracket && tags.includes(bracket[1].trim().toLowerCase())) return true;

    if (contains.some((t) => lower.includes(t))) return true;
    if (startsWith.some((t) => lower.startsWith(t))) return true;
    return false;
  };
}
