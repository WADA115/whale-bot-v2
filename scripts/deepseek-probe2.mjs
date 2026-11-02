import { loadConfig, ROOT } from '../src/config.js';
import path from 'node:path';
const { config } = loadConfig({ configPath: path.join(ROOT, 'config.json') });
const p = config.models.text.find((x) => x.id === 'deepseek');
async function probe(model, max) {
  const res = await fetch(`${String(p.baseURL).replace(/\/+$/,'')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${p.apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: '只回复两个字：在。' }], max_tokens: max, temperature: 0.2 })
  });
  const data = await res.json();
  const msg = data?.choices?.[0]?.message ?? {};
  console.log(model, 'max', max, 'status', res.status, 'finish', data?.choices?.[0]?.finish_reason, 'content', JSON.stringify(String(msg.content ?? '').slice(0,80)), 'reasoning-len', String(msg.reasoning_content ?? '').length);
}
await probe('deepseek-chat', 64);
await probe('deepseek-flash', 1000);
