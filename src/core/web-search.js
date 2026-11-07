function strip(html) {
  return String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function searchBing(query, { limit = 5, timeoutMs = 12000, fetchImpl = fetch } = {}) {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=zh-Hans`;
  const res = await fetchImpl(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36' },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!res.ok) throw new Error(`bing http ${res.status}`);
  const html = await res.text();
  const blocks = html.match(/<li class="b_algo"[\s\S]*?<\/li>/g) || [];
  const out = [];
  for (const block of blocks) {
    const titleMatch = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    const linkMatch = block.match(/<a[^>]+href="([^"]+)"/i);
    const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i) || block.match(/<div class="b_caption"[^>]*>([\s\S]*?)<\/div>/i);
    const title = strip(titleMatch?.[1]);
    const snippet = strip(snippetMatch?.[1]);
    if (!title && !snippet) continue;
    out.push({ title, snippet, url: linkMatch?.[1] || '' });
    if (out.length >= limit) break;
  }
  return out;
}
