import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const V1_ROOT = path.resolve(ROOT, '..', 'qq-bridge');

function run(command, args, { env, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: 'ignore', env: { ...process.env, ...env } });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('tts timeout'));
    }, timeoutMs);
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`tts exit ${code}`));
    });
  });
}

export function createTts({
  scriptPath = path.join(V1_ROOT, 'src', 'tts-edge.mjs'),
  voice = 'zh-CN-XiaoyiNeural',
  pythonPath = process.env.DSH_PYTHON || '',
  outDir = path.join(ROOT, 'state', 'voice'),
  timeoutMs = 30000,
  logger = null
} = {}) {
  fs.mkdirSync(outDir, { recursive: true });

  async function synthesize(text) {
    const value = String(text ?? '').trim().slice(0, 300);
    if (!value) return null;
    const out = path.join(outDir, `${Date.now()}-${Math.random().toString(36).slice(2, 7)}.mp3`);
    await run(process.execPath, [scriptPath, '--voice', voice, '--out', out, '--text', value], {
      env: { DSH_PYTHON: pythonPath },
      timeoutMs
    });
    if (!fs.existsSync(out) || fs.statSync(out).size < 500) throw new Error('tts output empty');
    logger?.info('tts.synthesized', { chars: value.length, bytes: fs.statSync(out).size });
    return out;
  }

  async function health() {
    const exists = fs.existsSync(scriptPath);
    return { ok: exists, scriptPath, voice, error: exists ? null : 'tts script missing' };
  }

  return { synthesize, health };
}
