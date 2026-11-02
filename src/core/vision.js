import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripThink } from './router.js';

const DEFAULT_PROMPT = [
  '你在帮 QQ 机器人认图。只写真实可见的内容，不要编。',
  '按三行输出：',
  '画面：人物/物体/场景',
  '文字：图片里的字，没有写“无”',
  '判断：可能是谁/什么游戏/软件/梗，每项标 高/中/低；不确定写“不确定”。',
  '80 字以内，不要输出思考过程。'
].join('\n');

export function imageSegments(message) {
  return (message?.segments ?? []).filter((seg) => seg?.type === 'image' && (seg?.data?.url || seg?.data?.file));
}

async function fetchImage(url, { timeoutMs = 15000, fetchImpl = fetch } = {}) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`image http ${res.status}`);
  const type = String(res.headers.get('content-type') || 'image/jpeg').split(';')[0];
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length || buf.length > 6 * 1024 * 1024) throw new Error('image too large or empty');
  return { base64: buf.toString('base64'), mime: type.startsWith('image/') ? type : 'image/jpeg' };
}

function requestFor(provider, { system, user, images }) {
  if (provider.type === 'openai') {
    if (!provider.apiKey) throw new Error('missing api key');
    return {
      url: `${String(provider.baseURL).replace(/\/+$/, '')}/chat/completions`,
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${provider.apiKey}` },
        body: JSON.stringify({
          model: provider.model,
          messages: [
            ...(system ? [{ role: 'system', content: system }] : []),
            {
              role: 'user',
              content: [
                { type: 'text', text: user },
                ...images.map((img) => ({ type: 'image_url', image_url: { url: `data:${img.mime};base64,${img.base64}` } }))
              ]
            }
          ],
          max_tokens: Number(provider.maxTokens) || 400,
          temperature: 0.1
        }),
        signal: AbortSignal.timeout(Number(provider.timeoutMs) || 30000)
      }
    };
  }
  if (provider.type === 'ollama') {
    return {
      url: `${String(provider.baseURL).replace(/\/+$/, '').replace(/\/v1$/, '')}/api/chat`,
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: provider.model,
          messages: [
            ...(system ? [{ role: 'system', content: system + '\n/no_think' }] : []),
            { role: 'user', content: user, images: images.map((img) => img.base64) }
          ],
          stream: false,
          think: false,
          options: {
            num_ctx: Number(provider.numCtx) || 4096,
            num_predict: Number(provider.maxTokens) || 700,
            temperature: 0.1
          }
        }),
        signal: AbortSignal.timeout(Number(provider.timeoutMs) || 90000)
      }
    };
  }
  throw new Error(`unsupported vision provider: ${provider.type}`);
}

function parseProvider(provider, data) {
  if (provider.type === 'openai') {
    return stripThink(data?.choices?.[0]?.message?.content ?? '');
  }
  return stripThink(data?.message?.content ?? '');
}

export function createVisionRouter({ providers = [], logger = null, fetchImpl = fetch } = {}) {
  async function describe({ message, prompt = DEFAULT_PROMPT } = {}) {
    if (!providers.length) throw new Error('no vision providers');
    const segs = imageSegments(message);
    if (!segs.length) return { text: '', provider: '' };
    const images = [];
    for (const seg of segs.slice(0, 3)) {
      let url = String(seg.data?.url ?? seg.data?.file ?? '');
      if (!url) continue;
      if (!/^(?:https?:|data:)/i.test(url)) {
        try {
          const file = url.startsWith('file://') ? new URL(url) : url;
          const local = file instanceof URL ? fileURLToPath(file) : path.resolve(file);
          const ext = path.extname(local).toLowerCase();
          const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : 'image/jpeg';
          url = `data:${mime};base64,${fs.readFileSync(local).toString('base64')}`;
        } catch {
          continue;
        }
      }
      try {
        images.push(await fetchImage(url, { fetchImpl }));
      } catch (error) {
        logger?.warn('vision.image_fetch_failed', { error: String(error?.message ?? error) });
      }
    }
    if (!images.length) throw new Error('no readable image');

    const errors = [];
    for (const provider of providers) {
      try {
        const { url, init } = requestFor(provider, { system: '', user: prompt, images });
        const res = await fetchImpl(url, init);
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`http ${res.status}${body ? ': ' + body.slice(0, 160) : ''}`);
        }
        const data = await res.json();
        const text = String(parseProvider(provider, data) ?? '').trim();
        if (!text) throw new Error('empty response');
        logger?.info('vision.ok', { provider: provider.id });
        return { text, provider: provider.id };
      } catch (error) {
        errors.push(`${provider.id}: ${String(error?.message ?? error)}`);
        logger?.warn('vision.provider_failed', { provider: provider.id, error: String(error?.message ?? error) });
      }
    }
    throw new Error(`all vision providers failed: ${errors.join(' | ')}`);
  }
  return { describe };
}

export { DEFAULT_PROMPT };
