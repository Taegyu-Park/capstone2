// 전날(KST) 기사를 수집·중복제거·선별해 data/YYYY-MM-DD.json으로 저장합니다.
// 요약(summary)은 이 단계에서 null로 두고 summarize.mjs가 채웁니다.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fetchAllFeeds } from './lib/rss.mjs';
import { dedupe, pickRoundRobin } from './lib/select.mjs';
import { makeExcluder } from './lib/exclude.mjs';
import { assertDateStr, kstDayRange, yesterdayKst } from './lib/kst.mjs';

const ROOT = new URL('..', import.meta.url);
const config = JSON.parse(readFileSync(new URL('config/digest.json', ROOT), 'utf8'));

const dateArg = process.argv.slice(2).find((a) => a.startsWith('--date='))?.slice(7);
const date = assertDateStr(dateArg || yesterdayKst());
const { start, end } = kstDayRange(date);
const limit = config.limits.perCategory;
const isExcluded = makeExcluder(config.exclude);
// 사설·칼럼처럼 "[사설]" 같은 대괄호 태그가 콘텐츠 자체인 카테고리는 bracketTags 제외를 건너뜁니다.
const opinionCategoryIds = new Set(config.categories.filter((c) => c.opinion).map((c) => c.id));

console.log(`[fetch] 대상일 ${date}(KST) · 피드 ${config.feeds.length}개 · 카테고리당 최대 ${limit}건`);

const results = await fetchAllFeeds(config.feeds, { timeoutMs: config.limits.feedTimeoutMs });

const feedStatus = [];
let excludedCount = 0;
const collected = [];
for (const r of results) {
  if (!r.ok) {
    console.warn(`[fetch] 실패 ${r.feed.source}: ${r.error}`);
    feedStatus.push({ source: r.feed.source, category: r.feed.category, ok: false, error: r.error, matched: 0 });
    continue;
  }
  const inWindow = r.items.filter((i) => {
    const t = new Date(i.publishedAt);
    return t >= start && t < end;
  });
  const matched = inWindow.filter(
    (i) => !isExcluded(i.title, { skipBracketTags: opinionCategoryIds.has(i.category) }),
  );
  excludedCount += inWindow.length - matched.length;
  feedStatus.push({ source: r.feed.source, category: r.feed.category, ok: true, matched: matched.length });
  collected.push(...matched);
}

const failedCount = feedStatus.filter((f) => !f.ok).length;
if (failedCount === feedStatus.length) {
  throw new Error('모든 피드 수집에 실패했습니다. 네트워크 또는 설정을 확인하세요.');
}

const items = [];
for (const cat of config.categories) {
  const inCat = dedupe(collected.filter((i) => i.category === cat.id), {
    similarityThreshold: config.limits.titleSimilarityThreshold,
  });
  const picked = pickRoundRobin(inCat, limit);
  const sources = [...new Set(picked.map((i) => i.source))];
  console.log(`[fetch] ${cat.id}: 수집 ${inCat.length}건 → 선별 ${picked.length}건 (매체 ${sources.length}곳)`);
  for (const item of picked) {
    items.push({
      id: createHash('sha1').update(item.normalizedLink).digest('hex').slice(0, 12),
      category: item.category,
      source: item.source,
      region: item.region,
      title: item.title,
      link: item.link,
      publishedAt: item.publishedAt,
      description: item.description,
      author: item.author,
      summary: null,
      summarySource: null,
    });
  }
}

if (items.length === 0) {
  throw new Error(`${date}(KST)에 해당하는 기사를 한 건도 찾지 못했습니다.`);
}

const payload = {
  date,
  generatedAt: new Date().toISOString(),
  categories: config.categories,
  feedStatus,
  items,
};

mkdirSync(new URL('data/', ROOT), { recursive: true });
const outPath = new URL(`data/${date}.json`, ROOT);
writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(`[fetch] 총 ${items.length}건 저장 · 공지성 기사 ${excludedCount}건 제외 · 피드 실패 ${failedCount}개 · data/${date}.json`);
