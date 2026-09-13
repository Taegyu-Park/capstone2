import { toKstTime } from './kst.mjs';

/** HTML 특수문자를 이스케이프합니다. 제목·요약은 모두 외부 입력이므로 반드시 거칩니다. */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 링크가 http(s)일 때만 통과시킵니다. */
function safeHref(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : '#';
  } catch {
    return '#';
  }
}

function formatDateLabel(dateStr) {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  // KST 자정을 UTC로 바꾸면 전날이 되므로, 날짜 문자열 자체를 UTC로 읽어 요일을 구합니다.
  const d = new Date(`${dateStr}T00:00:00Z`);
  return `${dateStr.slice(0, 4)}년 ${Number(dateStr.slice(5, 7))}월 ${Number(dateStr.slice(8, 10))}일 (${days[d.getUTCDay()]})`;
}

function renderCard(item) {
  const region = item.region === 'intl' ? '<span class="tag intl">해외</span>' : '';
  return `
          <article class="card">
            <div class="meta">
              <span class="source">${esc(item.source)}</span>${region}
              <time datetime="${esc(item.publishedAt)}">${esc(toKstTime(item.publishedAt))}</time>
            </div>
            <h3><a href="${esc(safeHref(item.link))}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a></h3>
            <p>${esc(item.summary || item.description || '')}</p>
          </article>`;
}

/** 하루치 다이제스트 페이지를 만듭니다. */
export function renderDigestPage(payload, { prev, next, basePath = '' }) {
  const { date, categories, items } = payload;
  const sourceCount = new Set(items.map((i) => i.source)).size;

  const tabs = categories
    .map((c, i) => {
      const n = items.filter((x) => x.category === c.id).length;
      return `<button class="tab${i === 0 ? ' active' : ''}" data-cat="${esc(c.id)}">${esc(c.label)}<span class="count">${n}</span></button>`;
    })
    .join('\n          ');

  const sections = categories
    .map((c, i) => {
      const list = items.filter((x) => x.category === c.id);
      const cards = list.length
        ? list.map(renderCard).join('\n')
        : '\n          <p class="empty">이 분야에서 수집된 기사가 없습니다.</p>';
      return `        <section class="panel${i === 0 ? ' active' : ''}" data-cat="${esc(c.id)}">
          <h2 class="sr-only">${esc(c.label)}</h2>${cards}
        </section>`;
    })
    .join('\n');

  const navPrev = prev
    ? `<a class="nav-link" href="${basePath}archive/${esc(prev)}.html">← ${esc(prev)}</a>`
    : '<span class="nav-link disabled">← 이전</span>';
  const navNext = next
    ? `<a class="nav-link" href="${basePath}archive/${esc(next)}.html">${esc(next)} →</a>`
    : '<span class="nav-link disabled">다음 →</span>';

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(formatDateLabel(date))} 뉴스 다이제스트</title>
<meta name="description" content="${esc(date)} 국내외 주요 뉴스 ${items.length}건을 분야별 헤드라인과 요약으로 정리했습니다.">
<link rel="stylesheet" href="${basePath}assets/style.css">
</head>
<body>
  <header class="site-header">
    <div class="wrap">
      <p class="eyebrow">데일리 뉴스 다이제스트</p>
      <h1>${esc(formatDateLabel(date))}</h1>
      <p class="summary-line">${items.length}건 · ${sourceCount}개 매체</p>
      <nav class="daynav">
        ${navPrev}
        <a class="nav-link" href="${basePath}archive/">전체 아카이브</a>
        ${navNext}
      </nav>
    </div>
  </header>

  <main class="wrap">
    <div class="tabs" role="tablist">
          ${tabs}
    </div>
${sections}
  </main>

  <footer class="wrap site-footer">
    <p>생성 ${esc(payload.summarizedAt || payload.generatedAt)} · 모든 시각은 KST 기준입니다.</p>
    <p>각 헤드라인은 원문 기사로 연결됩니다. 요약은 RSS 제공 정보를 바탕으로 자동 생성되었습니다.</p>
  </footer>

  <script src="${basePath}assets/app.js"></script>
</body>
</html>
`;
}

/** 아카이브 목록 페이지를 만듭니다. */
export function renderArchivePage(entries, { basePath = '../' } = {}) {
  const byMonth = new Map();
  for (const e of entries) {
    const month = e.date.slice(0, 7);
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month).push(e);
  }

  const groups = [...byMonth.entries()]
    .map(([month, list]) => {
      const rows = list
        .map(
          (e) => `        <li>
          <a href="${esc(e.date)}.html"><span class="d">${esc(e.date)}</span><span class="c">${e.count}건</span></a>
        </li>`,
        )
        .join('\n');
      return `      <section class="month">
        <h2>${esc(month.replace('-', '년 '))}월</h2>
        <ul class="archive-list">
${rows}
        </ul>
      </section>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>아카이브 · 데일리 뉴스 다이제스트</title>
<link rel="stylesheet" href="${basePath}assets/style.css">
</head>
<body>
  <header class="site-header">
    <div class="wrap">
      <p class="eyebrow">데일리 뉴스 다이제스트</p>
      <h1>아카이브</h1>
      <p class="summary-line">${entries.length}일치 · 총 ${entries.reduce((a, e) => a + e.count, 0)}건</p>
      <nav class="daynav"><a class="nav-link" href="${basePath}">최신 다이제스트로</a></nav>
    </div>
  </header>
  <main class="wrap">
${groups}
  </main>
</body>
</html>
`;
}
