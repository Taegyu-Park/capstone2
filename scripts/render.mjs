// data/*.json 전체를 읽어 site/를 통째로 다시 만듭니다.
// Pages 배포는 항상 전체 교체이므로, 매 실행마다 전부 생성해야 아카이브가 보존됩니다.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { renderDigestPage, renderArchivePage } from './lib/html.mjs';

const ROOT = new URL('..', import.meta.url);
const dataDir = new URL('data/', ROOT);
const siteDir = new URL('site/', ROOT);

const files = readdirSync(dataDir)
  .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
  .sort();
if (files.length === 0) throw new Error('data/에 다이제스트가 없습니다. 먼저 fetch를 실행하세요.');

const payloads = files.map((f) => JSON.parse(readFileSync(new URL(f, dataDir), 'utf8')));

rmSync(siteDir, { recursive: true, force: true });
mkdirSync(new URL('archive/', siteDir), { recursive: true });
cpSync(new URL('templates/assets/', ROOT), new URL('assets/', siteDir), { recursive: true });

// 날짜별 아카이브 페이지
payloads.forEach((payload, i) => {
  const html = renderDigestPage(payload, {
    prev: payloads[i - 1]?.date ?? null,
    next: payloads[i + 1]?.date ?? null,
    basePath: '../',
  });
  writeFileSync(new URL(`archive/${payload.date}.html`, siteDir), html, 'utf8');
});

// 최신 다이제스트를 첫 화면으로
const latest = payloads[payloads.length - 1];
const unsummarized = latest.items.filter((i) => !i.summary).length;
if (unsummarized > 0) {
  console.warn(`[render] 경고: ${latest.date} 기사 중 요약(summary)이 비어 있는 항목이 ${unsummarized}건 있습니다. summarize.mjs가 정상 실행되었는지 확인하세요.`);
}
writeFileSync(
  new URL('index.html', siteDir),
  renderDigestPage(latest, {
    prev: payloads[payloads.length - 2]?.date ?? null,
    next: null,
    basePath: '',
  }),
  'utf8',
);

// 아카이브 목록 (최신순)
const entries = [...payloads].reverse().map((p) => ({ date: p.date, count: p.items.length }));
writeFileSync(new URL('archive/index.html', siteDir), renderArchivePage(entries), 'utf8');

// Jekyll 처리를 끄지 않으면 _로 시작하는 경로가 무시됩니다.
writeFileSync(new URL('.nojekyll', siteDir), '', 'utf8');

console.log(`[render] ${payloads.length}일치 · 최신 ${latest.date} · site/ 생성 완료`);
