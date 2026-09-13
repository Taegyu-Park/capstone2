/**
 * config.exclude 규칙으로 제목을 걸러내는 함수를 만듭니다.
 * 정규식 대신 구조화된 규칙을 쓰므로 config에 이스케이프가 필요 없습니다.
 *
 * bracketTags는 카테고리에 따라 뜻이 반대가 됩니다. 예를 들어 "[사설]"은 일반
 * 뉴스 피드에 섞이면 걸러내야 할 공지성 태그지만, 사설·칼럼(opinion) 카테고리에서는
 * 그 자체가 콘텐츠입니다. 그래서 호출 쪽에서 opinion 카테고리일 때
 * skipBracketTags: true를 넘기면 그 검사만 건너뜁니다(titleContains/titleStartsWith는 그대로 적용).
 */
export function makeExcluder(exclude = {}) {
  const tags = (exclude.bracketTags || []).map((t) => t.toLowerCase());
  const contains = (exclude.titleContains || []).map((t) => t.toLowerCase());
  const startsWith = (exclude.titleStartsWith || []).map((t) => t.toLowerCase());

  return function isExcluded(rawTitle, { skipBracketTags = false } = {}) {
    const title = String(rawTitle || '').trim();
    const lower = title.toLowerCase();

    if (!skipBracketTags) {
      // "[태그] 본문" 형태에서 대괄호 안을 꺼내 비교합니다.
      const bracket = title.match(/^\[([^\]]{1,30})\]/);
      if (bracket && tags.includes(bracket[1].trim().toLowerCase())) return true;
    }

    if (contains.some((t) => lower.includes(t))) return true;
    if (startsWith.some((t) => lower.startsWith(t))) return true;
    return false;
  };
}
