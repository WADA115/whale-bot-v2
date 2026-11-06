import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export function createRvc({
  scriptPath = 'E:/AI/RVC/rvc_convert_cli.py',
  pythonPath = 'E:/AI/RVC/.venv/Scripts/python.exe',
  model = 'atri_e5.pth',
  outDir = 'state/voice',
  timeoutMs = 60000,
  logger = null
} = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  async function convert(input) {
    const out = path.join(outDir, `rvc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.wav`);
    await new Promise((resolve, reject) => {
      const child = spawn(pythonPath, [scriptPath, '--input', input, '--output', out, '--model', model], {
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
