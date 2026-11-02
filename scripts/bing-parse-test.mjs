import fs from 'node:fs';
const h = fs.readFileSync('E:/deepseek_qq.bot/qq-bridge-v2/state/bing-sample.html', 'utf8');
const strip = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const blocks = h.split(/<li class="b_algo"/).slice(1, 4);
for (const b of blocks) {
  const h2 = b.match(/<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
  const p = b.match(/<p[^>]*>([\s\S]*?)<\/p>/);
  console.log(JSON.stringify({ href: h2?.[1], title: h2 ? strip(h2[2]) : '', snip: p ? strip(p[1]).slice(0, 160) : '' }));
}
