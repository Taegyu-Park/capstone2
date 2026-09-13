import { titleKey } from './rss.mjs';

/** 문자 바이그램 집합. 한국어는 공백 토큰이 적어 바이그램이 더 안정적입니다. */
function bigrams(text) {
  const s = titleKey(text);
  const out = new Set();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

/** 두 제목의 자카드 유사도(0~1). */
export function titleSimilarity(a, b) {
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  for (const g of A) if (B.has(g)) shared++;
  return shared / (A.size + B.size - shared);
}

/**
 * 같은 기사를 가리키는 항목을 제거합니다.
 * URL이 같거나, 제목이 같거나, 제목 유사도가 임계값을 넘으면 먼저 발행된 쪽을 남깁니다.
 * 같은 매체가 '속보 → 종합'으로 여러 번 내보내는 기사를 주로 잡아냅니다.
 */
export function dedupe(items, { similarityThreshold = 0.45 } = {}) {
  const seenLink = new Set();
  const seenTitle = new Set();
  const kept = [];
  for (const item of [...items].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt))) {
    const tKey = titleKey(item.title);
    if (seenLink.has(item.normalizedLink) || (tKey && seenTitle.has(tKey))) continue;
    if (kept.some((k) => titleSimilarity(k.title, item.title) >= similarityThreshold)) continue;
    seenLink.add(item.normalizedLink);
    if (tKey) seenTitle.add(tKey);
    kept.push(item);
  }
  return kept;
}

/**
 * 매체별로 돌아가며 한 건씩 뽑아 limit개를 선별합니다.
 * 최신순으로 단순히 자르면 한 매체가 카테고리를 독점하므로 라운드로빈을 씁니다.
 */
export function pickRoundRobin(items, limit) {
  const bySource = new Map();
  for (const item of items) {
    if (!bySource.has(item.source)) bySource.set(item.source, []);
    bySource.get(item.source).push(item);
  }
  const queues = [...bySource.values()]
    .map((list) => list.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)))
    .sort((a, b) => b.length - a.length);

  const picked = [];
  for (let round = 0; picked.length < limit; round++) {
    let advanced = false;
    for (const queue of queues) {
      if (round >= queue.length) continue;
      picked.push(queue[round]);
      advanced = true;
      if (picked.length >= limit) break;
    }
    if (!advanced) break;
  }
  return picked.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}
