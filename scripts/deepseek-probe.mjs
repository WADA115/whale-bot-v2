import { loadConfig, ROOT } from '../src/config.js';
import path from 'node:path';
const { config } = loadConfig({ configPath: path.join(ROOT, 'config.json') });
const p = config.models.text.find((x) => x.id === 'deepseek');
const res = await fetch(`${String(p.baseURL).replace(/\/+$/,'')}/chat/completions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${p.apiKey}` },
  body: JSON.stringify({ model: p.model, messages: [{ role: 'user', content: '只回复两个字：在。' }], max_tokens: 64, temperature: 0.2 })
});
const text = await res.text();
console.log('status', res.status);
const data = JSON.parse(text);
const msg = data?.choices?.[0]?.message ?? {};
console.log('model', data.model, 'finish', data?.choices?.[0]?.finish_reason, 'content-len', String(msg.content ?? '').length, 'reasoning-len', String(msg.reasoning_content ?? '').length);
console.log('content', JSON.stringify(String(msg.content ?? '').slice(0, 200)));
console.log('reasoning', JSON.stringify(String(msg.reasoning_content ?? '').slice(0, 200)));
console.log('error', JSON.stringify(data.error ?? null).slice(0, 500));
