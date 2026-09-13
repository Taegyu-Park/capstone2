// config/digest.json의 모든 피드 상태를 점검합니다. 운영 중 죽은 피드를 찾을 때 사용합니다.
import { readFileSync } from 'node:fs';
import { fetchAllFeeds } from './lib/rss.mjs';
import { toKstDate, yesterdayKst } from './lib/kst.mjs';

const config = JSON.parse(readFileSync(new URL('../config/digest.json', import.meta.url), 'utf8'));
const target = process.argv[2] || yesterdayKst();

const results = await fetchAllFeeds(config.feeds, { timeoutMs: 15000 });
const pad = (s, n) => String(s).padEnd(n);

let failed = 0;
for (const cat of config.categories) {
  console.log(`\n[${cat.id}] ${cat.label}`);
  for (const r of results.filter((x) => x.feed.category === cat.id)) {
    if (!r.ok) {
      failed++;
      console.log(`  FAIL  ${pad(r.feed.source, 16)} ${r.error}`);
      continue;
    }
    const onTarget = r.items.filter((i) => toKstDate(new Date(i.publishedAt)) === target).length;
    const withDesc = r.items.filter((i) => i.description.length >= 40).length;
    const avg = r.items.length
      ? Math.round(r.items.reduce((a, i) => a + i.description.length, 0) / r.items.length)
      : 0;
    const newest = r.items[0]?.publishedAt ?? 'none';
    console.log(
      `  ok    ${pad(r.feed.source, 16)} 전체=${pad(r.items.length, 4)} ${target}=${pad(onTarget, 4)} 요약40자+=${pad(withDesc, 4)} 평균=${pad(avg, 5)} 최신=${newest}`,
    );
  }
}

console.log(`\n총 ${results.length}개 피드 중 ${failed}개 실패 · 기준일 ${target}(KST)`);
if (failed) process.exitCode = 1;
