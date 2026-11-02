import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

export function createAsr({ url = 'http://127.0.0.1:3199', ffmpegPath = 'ffmpeg', timeoutMs = 30000, logger = null } = {}) {
  let dir = '';
  function tempDir() {
    if (!dir) {
      dir = path.join(os.tmpdir(), `xiaoshen-asr-${process.pid}-${Date.now()}`);
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  async function fetchAudio(source, index) {
    const raw = String(source?.url ?? source?.file ?? '');
    if (!raw) throw new Error('empty voice source');
    const ext = path.extname(raw.split('?')[0]) || '.amr';
    const file = path.join(tempDir(), `voice-${index}${ext}`);
    if (/^https?:/i.test(raw)) {
      const res = await fetch(raw, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new Error(`voice http ${res.status}`);
      fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      return file;
    }
    if (fs.existsSync(raw)) return raw;
    throw new Error('voice file not found');
  }

  async function toWav(input, index) {
    if (path.extname(input).toLowerCase() === '.wav') return input;
    const out = path.join(tempDir(), `voice-${index}.wav`);
    await run(ffmpegPath, ['-y', '-i', input, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', out], timeoutMs);
    return out;
  }

  async function transcribe(segments = []) {
    const records = (segments || []).filter((seg) => seg?.type === 'record' && (seg?.data?.url || seg?.data?.file));
    if (!records.length) return '';
    const texts = [];
    for (let i = 0; i < records.length && i < 2; i++) {
      try {
        const input = await fetchAudio(records[i].data, i);
        const wav = await toWav(input, i);
        const res = await fetch(`${String(url).replace(/\/+$/, '')}/asr`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ wav }),
          signal: AbortSignal.timeout(timeoutMs)
        });
        if (!res.ok) throw new Error(`asr http ${res.status}`);
        const data = await res.json();
        const text = String(data?.text ?? '').trim();
        if (text) texts.push(text);
      } catch (error) {
        logger?.warn('asr.failed', { index: i, error: String(error?.message ?? error) });
      }
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
