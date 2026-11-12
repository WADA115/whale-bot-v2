import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const V1_ROOT = path.resolve(ROOT, '..', 'qq-bridge');
const TTS_SCRIPT = process.env.TTS_SCRIPT || path.join(V1_ROOT, 'src', 'tts-edge.mjs');
const FFMPEG = process.env.FFMPEG_PATH || path.join(V1_ROOT, 'tools', 'ffmpeg', 'ffmpeg.exe');
const MIXER = path.join(ROOT, 'src', 'audio', 'sing_mix.py');
const PYTHON = process.env.DSH_PYTHON || 'C:\\Users\\WADA\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe';

function run(command, args, { timeoutMs = 30000, stdin = null } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('sing timeout'));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { out += chunk.toString(); });
    child.stderr.on('data', (chunk) => { err += chunk.toString(); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out.trim());
      else reject(new Error(err.trim() || `sing exit ${code}`));
    });
    if (stdin != null) child.stdin.end(stdin);
  });
}

const MELODY = [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 392.0, 349.23];

export function createSing({
  voice = 'zh-CN-XiaoyiNeural',
  ttsScript = TTS_SCRIPT,
  ffmpegPath = FFMPEG,
  pythonPath = PYTHON,
  outDir = path.join(ROOT, 'state', 'sing'),
  timeoutMs = 24000,
  logger = null
} = {}) {
  fs.mkdirSync(outDir, { recursive: true });

  async function render({ lyrics } = {}) {
    const chars = Array.from(String(lyrics ?? '').replace(/[^\p{L}\p{N}]/gu, '')).slice(0, 16);
    if (!chars.length) throw new Error('empty lyrics');
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const work = path.join(outDir, stamp);
    fs.mkdirSync(work, { recursive: true });
    const segments = [];
    try {
      for (let i = 0; i < chars.length; i += 1) {
        const note = MELODY[i % MELODY.length];
        const pitch = Math.round((note - 261.63) * 0.9);
        const mp3 = path.join(work, `${i}.mp3`);
        const wav = path.join(work, `${i}.wav`);
        await run(process.execPath, [
          ttsScript,
          '--voice', voice,
          '--pitch', `${pitch >= 0 ? '+' : ''}${pitch}Hz`,
          '--out', mp3,
          '--text', chars[i]
        ], { timeoutMs });
        await run(ffmpegPath, ['-y', '-loglevel', 'error', '-i', mp3, '-ar', '24000', '-ac', '1', wav], { timeoutMs });
        segments.push(wav);
      }
      const wavOut = path.join(work, 'song.wav');
      const mp3Out = path.join(outDir, `${stamp}.mp3`);
      await run(pythonPath, [MIXER], {
        timeoutMs,
        stdin: JSON.stringify({ segments, notes: chars.map((_, i) => MELODY[i % MELODY.length]), out: wavOut })
      });
      await run(ffmpegPath, ['-y', '-loglevel', 'error', '-i', wavOut, '-codec:a', 'libmp3lame', '-q:a', '5', mp3Out], { timeoutMs });
      if (!fs.existsSync(mp3Out) || fs.statSync(mp3Out).size < 2000) throw new Error('sing output empty');
      logger?.info('sing.rendered', { chars: chars.length, bytes: fs.statSync(mp3Out).size });
      return { file: mp3Out, chars: chars.length };
    } finally {
      try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
  }

  async function health() {
    return {
      ok: fs.existsSync(ttsScript) && fs.existsSync(ffmpegPath) && fs.existsSync(MIXER),
      ttsScript,
      ffmpeg: ffmpegPath,
      mixer: MIXER
    };
  }

  return { render, health };
}
