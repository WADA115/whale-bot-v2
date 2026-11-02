const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

function decodeEntities(text) {
  return String(text ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number(num)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;|&ensp;|&emsp;/g, ' ')
    .replace(/&hellip;/g, '…')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(html) {
  return decodeEntities(String(html ?? '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '));
}

export function parseBing(html, { limit = 5 } = {}) {
  const blocks = String(html ?? '').split(/<li class="b_algo"/i).slice(1);
  const results = [];
  for (const block of blocks) {
    const part = block.split(/<\/li>/i)[0];
    const heading = part.match(/<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!heading) continue;
    const href = decodeEntities(heading[1]);
    const title = stripTags(heading[2]);
    if (!title || !/^https?:\/\//i.test(href)) continue;
    const snippet = part.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? '';
    results.push({ title, url: href, snippet: stripTags(snippet).slice(0, 300) });
    if (results.length >= limit) break;
  }
  return results;
}

export async function bingSearch(query, { limit = 5, timeoutMs = 12000, fetchImpl = fetch, logger = null } = {}) {
  const q = String(query ?? '').trim().slice(0, 300);
  if (!q) throw new Error('empty query');
  const url = `https://www.bing.com/search?q=${encodeURIComponent(q)}&setlang=zh-Hans&cc=CN`;
  const response = await fetchImpl(url, {
    headers: { 'user-agent': UA, 'accept-language': 'zh-CN,zh;q=0.9,en;q=0.6' },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`bing http ${response.status}`);
  const html = await response.text();
  const results = parseBing(html, { limit });
  if (!results.length) throw new Error('bing returned no results');
  logger?.info('websearch.bing', { q, count: results.length });
  return results;
}

export function searchQueryFromTask(text) {
  return String(text ?? '')
    .trim()
    .replace(/^(?:请)?帮我/, '')
    .replace(/^(?:搜索一下|搜一下|查一下|找一下|搜索|查|找)/, '')
    .replace(/^(?:一下|下)/, '')
    .trim() || String(text ?? '').trim();
}
