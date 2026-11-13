import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export function createRvc({
  scriptPath = '',
  pythonPath = '',
  model = 'atri_e5.pth',
  device = 'cpu',
  url = '',
  outDir = 'state/voice',
  timeoutMs = 60000,
  logger = null
} = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  async function convert(input) {
    if (url) {
      try {
        const res = await fetch(url, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ input }), signal: AbortSignal.timeout(timeoutMs)
        });
        const data = await res.json();
        if (res.ok && data?.file && fs.existsSync(data.file)) {
          logger?.info('rvc.converted_http', { bytes: fs.statSync(data.file).size });
          return data.file;
        }
        throw new Error(data?.error || `rvc http ${res.status}`);
      } catch (error) {
        logger?.warn('rvc.http_failed', { error: String(error?.message ?? error) });
      }
    }
    const out = path.join(outDir, `rvc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.wav`);
    await new Promise((resolve, reject) => {
      const child = spawn(pythonPath, [scriptPath, '--input', input, '--output', out, '--model', model, '--device', device], {
        windowsHide: true,
        stdio: 'ignore'
      });
      const timer = setTimeout(() => { child.kill(); reject(new Error('rvc timeout')); }, timeoutMs);
      child.on('error', (e) => { clearTimeout(timer); reject(e); });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0 && fs.existsSync(out) && fs.statSync(out).size > 500) resolve();
        else reject(new Error(`rvc exit ${code}`));
      });
    });
    logger?.info('rvc.converted', { bytes: fs.statSync(out).size });
    return out;
  }
  async function health() {
    return { ok: fs.existsSync(scriptPath) && fs.existsSync(pythonPath), scriptPath, model };
  }
  return { convert, health };
}
