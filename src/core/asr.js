import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

function run(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: 'ignore' });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('ffmpeg timeout'));
    }, timeoutMs);
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}`));
    });
  });
}

export function createAsr({
  url = 'http://127.0.0.1:3199',
  ffmpegPath = 'ffmpeg',
  timeoutMs = 30000,
  cacheFile = '',
  vad = true,
  cacheLimit = 100,
  logger = null
} = {}) {
  let dir = '';
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch { cache = {}; }
  if (!cache || typeof cache !== 'object') cache = {};

  function tempDir() {
    if (!dir) {
      dir = path.join(os.tmpdir(), `xiaoshen-asr-${process.pid}-${Date.now()}`);
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  function persistCache() {
    if (!cacheFile) return;
    try {
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
      fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2) + '\n', 'utf8');
    } catch (error) { logger?.warn('asr.cache_write_failed', { error: String(error?.message ?? error) }); }
  }

  function hashFile(file) {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  }

  async function fetchAudio(source, index, runId, tempFiles) {
    const raw = String(source?.url ?? source?.file ?? '');
    if (!raw) throw new Error('empty voice source');
    const ext = path.extname(raw.split('?')[0]) || '.amr';
    const file = path.join(tempDir(), `voice-${runId}-${index}${ext}`);
    if (/^https?:/i.test(raw)) {
      const res = await fetch(raw, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new Error(`voice http ${res.status}`);
      fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      tempFiles.push(file);
      return file;
    }
    if (fs.existsSync(raw)) return raw;
    throw new Error('voice file not found');
  }

  async function toWav(input, index, runId, tempFiles) {
    const out = path.join(tempDir(), `voice-${runId}-${index}-conv.wav`);
    tempFiles.push(out);
    const base = ['-y', '-i', input, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le'];
    if (vad) {
      const filter = 'silenceremove=start_periods=1:start_duration=0.08:start_threshold=-45dB:stop_periods=-1:stop_duration=0.25:stop_threshold=-45dB';
      try {
        await run(ffmpegPath, [...base, '-af', filter, out], timeoutMs);
        return out;
      } catch {}
    }
    await run(ffmpegPath, [...base, out], timeoutMs);
    return out;
  }

  function cleanup(files) {
    for (const file of files) {
      try { fs.rmSync(file, { force: true }); } catch {}
    }
  }

  async function transcribe(segments = []) {
    const runId = crypto.randomUUID().slice(0, 8);
    const tempFiles = [];
    const records = (segments || []).filter((seg) => seg?.type === 'record' && (seg?.data?.url || seg?.data?.file));
    if (!records.length) return '';
    const texts = [];
    try {
      for (let i = 0; i < records.length && i < 2; i++) {
        try {
          const input = await fetchAudio(records[i].data, i, runId, tempFiles);
          const key = hashFile(input);
          if (cache[key]) { texts.push(cache[key]); continue; }
          const wav = await toWav(input, i, runId, tempFiles);
          const res = await fetch(`${String(url).replace(/\/+$/, '')}/asr`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ wav }),
            signal: AbortSignal.timeout(timeoutMs)
          });
          if (!res.ok) throw new Error(`asr http ${res.status}`);
          const data = await res.json();
          const text = String(data?.text ?? '').trim();
          if (text) {
            texts.push(text);
            cache[key] = text;
            const keys = Object.keys(cache);
            while (keys.length > cacheLimit) delete cache[keys.shift()];
            persistCache();
          }
        } catch (error) {
          logger?.warn('asr.failed', { index: i, error: String(error?.message ?? error) });
        }
      }
    } finally {
      cleanup(tempFiles);
    }
    return texts.join('\n').trim();
  }

  async function health() {
    try {
      const res = await fetch(`${String(url).replace(/\/+$/, '')}/health`, { signal: AbortSignal.timeout(2000) });
      if (!res.ok) return { ok: false, url, error: `http ${res.status}` };
      return { ok: true, url };
    } catch (error) {
      return { ok: false, url, error: String(error?.message ?? error) };
    }
  }

  return { transcribe, health };
}
