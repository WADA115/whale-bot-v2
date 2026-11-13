import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { stripThink } from './router.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(fetchImpl, url, init, attempts = 3) {
  let last;
  for (let i = 0; i < attempts; i += 1) {
    try { return await fetchImpl(url, init); } catch (error) {
      last = error;
      if (i < attempts - 1) await sleep(700 * (i + 1));
    }
  }
  throw last;
}

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

function run(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: 'ignore' });
    const timer = setTimeout(() => { child.kill(); reject(new Error('ffmpeg timeout')); }, timeoutMs);
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}`));
    });
  });
}

async function readSource(source, { timeoutMs, fetchImpl }) {
  const raw = String(source?.url ?? source?.file ?? '');
  if (!raw) throw new Error('empty image source');
  const dataMatch = raw.match(/^data:([^;]+);base64,(.+)$/i);
  if (dataMatch) return { buffer: Buffer.from(dataMatch[2], 'base64'), mime: dataMatch[1] || 'image/jpeg' };
  if (/^https?:/i.test(raw)) {
    const res = await fetchImpl(raw, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`image http ${res.status}`);
    const type = String(res.headers.get('content-type') || 'image/jpeg').split(';')[0];
    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.length || buffer.length > 12 * 1024 * 1024) throw new Error('image too large or empty');
    return { buffer, mime: type.startsWith('image/') ? type : 'image/jpeg' };
  }
  const file = raw.startsWith('file://') ? fileURLToPath(new URL(raw)) : path.resolve(raw);
  const ext = path.extname(file).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : 'image/jpeg';
  return { buffer: fs.readFileSync(file), mime };
}

async function shrinkImage(image, { ffmpegPath, timeoutMs = 15000 } = {}) {
  if (!ffmpegPath || image.buffer.length < 180 * 1024) return image;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xiaoyu-vision-'));
  const ext = image.mime.includes('png') ? '.png' : image.mime.includes('webp') ? '.webp' : image.mime.includes('gif') ? '.gif' : '.jpg';
  const input = path.join(dir, `in${ext}`);
  const output = path.join(dir, 'out.jpg');
  try {
    fs.writeFileSync(input, image.buffer);
    await run(ffmpegPath, ['-y', '-i', input, '-vf', "scale='min(1024,iw)':-2", '-q:v', '4', output], timeoutMs);
    const buffer = fs.readFileSync(output);
    if (!buffer.length) return image;
    return { buffer, mime: 'image/jpeg' };
  } catch {
    return image;
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
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
          max_tokens: Number(provider.maxTokens) || 300,
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
          keep_alive: provider.keepAlive || '30m',
          options: {
            num_ctx: Number(provider.numCtx) || 4096,
            num_predict: Number(provider.maxTokens) || 300,
            temperature: 0.1
          }
        }),
        signal: AbortSignal.timeout(Number(provider.timeoutMs) || 30000)
      }
    };
  }
  throw new Error(`unsupported vision provider: ${provider.type}`);
}

function parseProvider(provider, data) {
  if (provider.type === 'openai') return stripThink(data?.choices?.[0]?.message?.content ?? '');
  return stripThink(data?.message?.content ?? '');
}

export function createVisionRouter({
  providers = [],
  logger = null,
  fetchImpl = fetch,
  ffmpegPath = '',
  cacheFile = '',
  cacheLimit = 40
} = {}) {
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch { cache = {}; }
  if (!cache || typeof cache !== 'object') cache = {};

  function persistCache() {
    if (!cacheFile) return;
    try {
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
      fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2) + '\n', 'utf8');
    } catch (error) { logger?.warn('vision.cache_write_failed', { error: String(error?.message ?? error) }); }
  }

  async function describe({ message, prompt = DEFAULT_PROMPT } = {}) {
    if (!providers.length) throw new Error('no vision providers');
    const segs = imageSegments(message);
    if (!segs.length) return { text: '', provider: '' };

    const images = [];
    const cached = [];
    for (const seg of segs.slice(0, 3)) {
      try {
        const raw = String(seg.data?.url ?? seg.data?.file ?? '');
        const urlKey = raw ? 'u:' + crypto.createHash('sha256').update(raw).digest('hex') : '';
        if (urlKey && cache[urlKey]) { cached.push(cache[urlKey]); continue; }
        const source = await readSource(seg.data, { timeoutMs: 30000, fetchImpl });
        const key = crypto.createHash('sha256').update(source.buffer).digest('hex');
        if (cache[key]) { cached.push(cache[key]); if (urlKey) cache[urlKey] = cache[key]; continue; }
        const shrunk = await shrinkImage(source, { ffmpegPath });
        images.push({ base64: shrunk.buffer.toString('base64'), mime: shrunk.mime, key, urlKey });
      } catch (error) {
        logger?.warn('vision.image_fetch_failed', { error: String(error?.message ?? error) });
      }
    }

    if (!images.length) {
      if (cached.length) return { text: cached.join('\n'), provider: 'cache' };
      throw new Error('no readable image');
    }

    const user = cached.length ? `${prompt}\n已知文字：\n${cached.join('\n')}` : prompt;
    const errors = [];
    for (const provider of providers) {
      try {
        const { url, init } = requestFor(provider, { system: '', user, images });
        const res = await fetchWithRetry(fetchImpl, url, init);
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`http ${res.status}${body ? ': ' + body.slice(0, 160) : ''}`);
        }
        const data = await res.json();
        const text = String(parseProvider(provider, data) ?? '').trim();
        if (!text) throw new Error('empty response');
        for (const image of images) { cache[image.key] = text; if (image.urlKey) cache[image.urlKey] = text; }
        const keys = Object.keys(cache);
        while (keys.length > cacheLimit) delete cache[keys.shift()];
        persistCache();
        logger?.info('vision.ok', { provider: provider.id, cached: cached.length, fresh: images.length });
        return { text, provider: provider.id };
      } catch (error) {
        errors.push(`${provider.id}: ${String(error?.message ?? error)}`);
        logger?.warn('vision.provider_failed', { provider: provider.id, error: String(error?.message ?? error) });
      }
    }
    throw new Error(`all vision providers failed: ${errors.join(' | ')}`);
  }

  async function warmup() {
    for (const provider of providers) {
      if (provider.type !== 'ollama') continue;
      try {
        await fetchWithRetry(fetchImpl, `${String(provider.baseURL).replace(/\/+$/, '').replace(/\/v1$/, '')}/api/chat`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model: provider.model, messages: [{ role: 'user', content: 'ok' }], stream: false, think: false, keep_alive: provider.keepAlive || '30m', options: { num_predict: 1 } }),
          signal: AbortSignal.timeout(120000)
        }, 8);
        logger?.info('vision.warmed', { provider: provider.id, model: provider.model });
      } catch (error) { logger?.warn('vision.warm_failed', { provider: provider.id, error: String(error?.message ?? error) }); }
    }
  }

  return { describe, warmup };
}

export { DEFAULT_PROMPT };
