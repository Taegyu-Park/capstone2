// data/YYYY-MM-DD.json의 각 기사에 한국어 1~2문장 요약을 채웁니다.
// LLM 호출이 실패하거나 누락되면 RSS 원문 설명으로 폴백하므로, 이 단계가 실패해도 발행은 됩니다.
import { readFileSync, writeFileSync } from 'node:fs';
import { runClaude, extractJsonArray } from './lib/claude.mjs';
import { assertDateStr, yesterdayKst } from './lib/kst.mjs';

const ROOT = new URL('..', import.meta.url);
const config = JSON.parse(readFileSync(new URL('config/digest.json', ROOT), 'utf8'));
const opts = config.summarize;

const dateArg = process.argv.slice(2).find((a) => a.startsWith('--date='))?.slice(7);
const date = assertDateStr(dateArg || yesterdayKst());
const dataPath = new URL(`data/${date}.json`, ROOT);
const payload = JSON.parse(readFileSync(dataPath, 'utf8'));

const SYSTEM_PROMPT = [
  '당신은 한국어 뉴스 다이제스트 편집자입니다.',
  '주어진 기사 정보만으로 사실에 충실한 요약을 쓰고, 요청된 JSON 형식만 출력합니다.',
].join(' ');

/** 문장 경계에서 잘라 폴백 요약을 만듭니다. */
function fallbackSummary(item) {
  const text = item.description.replace(/\s+/g, ' ').trim();
  if (text.length <= opts.maxChars) return text;
  const cut = text.slice(0, opts.maxChars);
  const boundary = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('다. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  return (boundary > opts.minChars ? cut.slice(0, boundary + 1) : cut.trimEnd() + '…').trim();
}

function buildPrompt(categoryLabel, items) {
  const articles = items
    .map((i, n) => [
      `### ${n + 1}`,
      `id: ${i.id}`,
      `매체: ${i.source}`,
      `제목: ${i.title}`,
      `원문요약: ${i.description || '(없음)'}`,
    ].join('\n'))
    .join('\n\n');

  return [
    `아래는 '${categoryLabel}' 분야의 어제 뉴스 ${items.length}건입니다. 각 기사를 한국어 1~2문장으로 요약하세요.`,
    '',
    '규칙:',
    '- 제목을 그대로 되풀이하지 말고, 기사가 전하는 핵심 사실을 문장으로 풀어 쓰세요.',
    '- 원문이 영어면 한국어로 요약하세요. 고유명사는 원어를 병기해도 됩니다.',
    `- 공백 포함 ${opts.minChars}~${opts.maxChars}자로 쓰세요.`,
    '- 주어진 정보에 없는 사실을 추측해 덧붙이지 마세요. 정보가 부족하면 있는 내용만 쓰세요.',
    '- 기자 이름, 이메일, 구독 안내, 광고 문구, 사진 설명은 버리세요.',
    '- 문어체 평서문("~했다")으로 끝맺으세요.',
    '',
    '출력은 아래 형태의 JSON 배열 하나만. 코드펜스나 설명 없이 배열만 출력하세요.',
    '[{"id": "기사의 id", "summary": "요약문"}]',
    '',
    '기사 목록:',
    '',
    articles,
  ].join('\n');
}

/** 모델 응답을 id→요약 맵으로 정리합니다. 형식이 어긋난 항목은 버립니다. */
function collectSummaries(rawList, validIds) {
  const map = new Map();
  for (const entry of rawList) {
    if (!entry || typeof entry !== 'object') continue;
    const id = String(entry.id ?? '').trim();
    const summary = String(entry.summary ?? '').replace(/\s+/g, ' ').trim();
    if (!validIds.has(id) || summary.length < opts.minChars) continue;
    map.set(id, summary.length > opts.maxChars * 1.5 ? summary.slice(0, opts.maxChars) + '…' : summary);
  }
  return map;
}

let llmCount = 0;
let fallbackCount = 0;

for (const cat of payload.categories) {
  const items = payload.items.filter((i) => i.category === cat.id);
  if (items.length === 0) continue;

  const validIds = new Set(items.map((i) => i.id));
  let summaries = new Map();

  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    const pending = items.filter((i) => !summaries.has(i.id));
    if (pending.length === 0) break;
    try {
      const { text } = await runClaude(buildPrompt(cat.label, pending), {
        model: opts.model,
        systemPrompt: SYSTEM_PROMPT,
        timeoutMs: opts.timeoutMs,
      });
      const got = collectSummaries(extractJsonArray(text), validIds);
      for (const [id, s] of got) summaries.set(id, s);
      console.log(`[summarize] ${cat.id} 시도 ${attempt + 1}: ${pending.length}건 요청 → ${got.size}건 수신`);
    } catch (e) {
      console.warn(`[summarize] ${cat.id} 시도 ${attempt + 1} 실패: ${e.message}`);
    }
  }

  for (const item of items) {
    if (summaries.has(item.id)) {
      item.summary = summaries.get(item.id);
      item.summarySource = 'llm';
      llmCount++;
    } else {
      item.summary = fallbackSummary(item);
      item.summarySource = 'rss';
      fallbackCount++;
    }
  }
}

payload.summarizedAt = new Date().toISOString();
payload.summaryStats = { llm: llmCount, fallback: fallbackCount, model: opts.model };
writeFileSync(dataPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(`[summarize] 완료 · LLM ${llmCount}건 / 폴백 ${fallbackCount}건 · data/${date}.json`);
