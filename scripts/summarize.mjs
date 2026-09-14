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
function fallbackSummary(item, { minChars, maxChars }) {
  const text = item.description.replace(/\s+/g, ' ').trim();
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const boundary = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('다. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  return (boundary > minChars ? cut.slice(0, boundary + 1) : cut.trimEnd() + '…').trim();
}

/**
 * 사설·칼럼(opinion) 카테고리는 일반 뉴스와 다른 지시가 필요합니다.
 * 사실을 전달하는 게 아니라 특정 입장을 주장하는 글이므로, 논지와 논조를
 * 살려 쓰라고 명시하지 않으면 다른 카테고리처럼 밋밋한 사실 나열이 되어버립니다.
 */
function buildPrompt(cat, items, { minChars, maxChars }) {
  const articles = items
    .map((i, n) => [
      `### ${n + 1}`,
      `id: ${i.id}`,
      `매체: ${i.source}`,
      ...(i.author ? [`필자: ${i.author}`] : []),
      `제목: ${i.title}`,
      `원문요약: ${i.description || '(없음)'}`,
    ].join('\n'))
    .join('\n\n');

  const rules = cat.opinion
    ? [
        '- 이 글들은 사실을 보도하는 기사가 아니라 특정 입장을 주장하는 사설·칼럼입니다.',
        '- 글쓴이(또는 매체)가 무엇을 주장하는지, 그 근거가 무엇인지 요약하세요. 제목을 되풀이하지 마세요.',
        '- "~라고 주장했다", "~을 촉구했다", "~라고 비판했다", "~라며 우려했다"처럼 이것이 의견임을 드러내는 표현으로 쓰세요.',
        '- 원문이 영어면 한국어로 요약하세요. 고유명사는 원어를 병기해도 됩니다.',
        `- 공백 포함 ${minChars}~${maxChars}자로 쓰세요.`,
        '- 주어진 정보에 없는 사실을 추측해 덧붙이지 마세요. 정보가 부족하면 있는 내용만 쓰세요.',
        '- 기자 이름, 이메일, 구독 안내, 광고 문구는 버리세요.',
      ]
    : [
        '- 제목을 그대로 되풀이하지 말고, 기사가 전하는 핵심 사실을 문장으로 풀어 쓰세요.',
        '- 원문이 영어면 한국어로 요약하세요. 고유명사는 원어를 병기해도 됩니다.',
        `- 공백 포함 ${minChars}~${maxChars}자로 쓰세요.`,
        '- 주어진 정보에 없는 사실을 추측해 덧붙이지 마세요. 정보가 부족하면 있는 내용만 쓰세요.',
        '- 기자 이름, 이메일, 구독 안내, 광고 문구, 사진 설명은 버리세요.',
        '- 문어체 평서문("~했다")으로 끝맺으세요.',
      ];

  const titleRule = '- title: 원제목이 한국어가 아니면 자연스러운 한국어 헤드라인으로 번역하세요(고유명사는 원어 병기 가능). 원제목이 이미 한국어면 그대로 반환하세요.';

  const topic = cat.opinion ? '사설·칼럼' : '뉴스';
  return [
    `아래는 '${cat.label}' 분야의 어제 ${topic} ${items.length}건입니다. 각 글을 한국어 1~2문장으로 요약하세요.`,
    '',
    '규칙:',
    ...rules,
    titleRule,
    '',
    '출력은 아래 형태의 JSON 배열 하나만. 코드펜스나 설명 없이 배열만 출력하세요.',
    '[{"id": "기사의 id", "title": "한국어 제목", "summary": "요약문"}]',
    '',
    '기사 목록:',
    '',
    articles,
  ].join('\n');
}

/** 모델 응답을 id→{title, summary} 맵으로 정리합니다. 형식이 어긋난 항목은 버립니다. */
function collectResults(rawList, validIds, { minChars, maxChars }) {
  const map = new Map();
  for (const entry of rawList) {
    if (!entry || typeof entry !== 'object') continue;
    const id = String(entry.id ?? '').trim();
    const summary = String(entry.summary ?? '').replace(/\s+/g, ' ').trim();
    if (!validIds.has(id) || summary.length < minChars) continue;
    const title = String(entry.title ?? '').replace(/\s+/g, ' ').trim();
    map.set(id, {
      summary: summary.length > maxChars * 1.5 ? summary.slice(0, maxChars) + '…' : summary,
      title: title || null,
    });
  }
  return map;
}

let llmCount = 0;
let fallbackCount = 0;

for (const cat of payload.categories) {
  const items = payload.items.filter((i) => i.category === cat.id);
  if (items.length === 0) continue;

  const bounds = { minChars: cat.summaryMinChars || opts.minChars, maxChars: cat.summaryMaxChars || opts.maxChars };
  const validIds = new Set(items.map((i) => i.id));
  let summaries = new Map();

  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    const pending = items.filter((i) => !summaries.has(i.id));
    if (pending.length === 0) break;
    try {
      const { text } = await runClaude(buildPrompt(cat, pending, bounds), {
        model: opts.model,
        systemPrompt: SYSTEM_PROMPT,
        timeoutMs: opts.timeoutMs,
      });
      const got = collectResults(extractJsonArray(text), validIds, bounds);
      for (const [id, r] of got) summaries.set(id, r);
      console.log(`[summarize] ${cat.id} 시도 ${attempt + 1}: ${pending.length}건 요청 → ${got.size}건 수신`);
    } catch (e) {
      console.warn(`[summarize] ${cat.id} 시도 ${attempt + 1} 실패: ${e.message}`);
    }
  }

  for (const item of items) {
    if (summaries.has(item.id)) {
      const { summary, title } = summaries.get(item.id);
      item.summary = summary;
      item.summarySource = 'llm';
      // 번역 실패 시 원제목을 그대로 둡니다 — 발행을 막을 이유는 아닙니다.
      if (title) item.title = title;
      llmCount++;
    } else {
      item.summary = fallbackSummary(item, bounds);
      item.summarySource = 'rss';
      fallbackCount++;
    }
  }
}

payload.summarizedAt = new Date().toISOString();
payload.summaryStats = { llm: llmCount, fallback: fallbackCount, model: opts.model };
writeFileSync(dataPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(`[summarize] 완료 · LLM ${llmCount}건 / 폴백 ${fallbackCount}건 · data/${date}.json`);
