import Parser from 'rss-parser';

const parser = new Parser();
const UA = 'Mozilla/5.0 (compatible; daily-news-digest/1.0; +https://github.com/Taegyu-Park)';
const DEFAULT_TIMEOUT_MS = 15000;

/** HTML 태그와 엔티티를 제거하고 공백을 정리합니다. */
export function stripHtml(input) {
  if (!input) return '';
  return String(input)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

/** 추적 파라미터를 제거해 중복 판정용으로 URL을 정규화합니다. */
export function normalizeUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|igshid|ref|ref_src|spm|cmpid|CMP|at_)/i.test(key)) {
        u.searchParams.delete(key);
      }
    }
    u.hash = '';
    u.hostname = u.hostname.replace(/^www\./, '');
    let s = u.toString();
    if (s.endsWith('?')) s = s.slice(0, -1);
    return s;
  } catch {
    return rawUrl;
  }
}

/** 제목을 중복 판정용 키로 정규화합니다(기호·공백 제거). */
export function titleKey(title) {
  return stripHtml(title).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/** 피드 하나를 수집해 정규화된 기사 목록을 돌려줍니다. 실패해도 예외를 던지지 않습니다. */
export async function fetchFeed(feed, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const res = await fetch(feed.url, {
      signal: ac.signal,
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml, */*' },
    });
    if (!res.ok) {
      return { feed, ok: false, error: `HTTP ${res.status}`, ms: Date.now() - startedAt, items: [] };
    }
    const parsed = await parser.parseString(await res.text());
    const items = [];
    for (const raw of parsed.items || []) {
      const link = raw.link?.trim();
      const title = stripHtml(raw.title);
      if (!link || !title) continue;
      const stamp = raw.isoDate || raw.pubDate;
      if (!stamp) continue;
      const publishedAt = new Date(stamp);
      if (Number.isNaN(publishedAt.getTime())) continue;
      items.push({
        title,
        link,
        normalizedLink: normalizeUrl(link),
        source: feed.source,
        category: feed.category,
        region: feed.region,
        publishedAt: publishedAt.toISOString(),
        description: stripHtml(raw.contentSnippet || raw.summary || raw.content || '').slice(0, 600),
      });
    }
    return { feed, ok: true, items, ms: Date.now() - startedAt };
  } catch (e) {
    const msg = e?.name === 'AbortError' ? `타임아웃 ${timeoutMs}ms` : String(e?.message || e);
    return { feed, ok: false, error: msg.slice(0, 120), ms: Date.now() - startedAt, items: [] };
  } finally {
    clearTimeout(timer);
  }
}

/** 모든 피드를 병렬 수집합니다. 개별 실패는 결과에 담아 돌려줍니다. */
export function fetchAllFeeds(feeds, opts) {
  return Promise.all(feeds.map((f) => fetchFeed(f, opts)));
}
