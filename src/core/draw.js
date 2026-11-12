import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SCRIPT = path.join(ROOT, 'src', 'drawing', 'sketch.py');

function candidates() {
  return [
    process.env.DSH_PYTHON,
    'C:\\Users\\WADA\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe',
    'python',
    'python3'
  ].filter(Boolean);
}

function canDraw(python) {
  try {
    execFileSync(python, ['-c', 'from PIL import Image'], { stdio: 'ignore', timeout: 8000 });
    return true;
  } catch {
    return false;
  }
}

function run(python, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(python, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('draw timeout'));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { out += chunk.toString(); });
    child.stderr.on('data', (chunk) => { err += chunk.toString(); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out.trim());
      else reject(new Error(err.trim() || `draw exit ${code}`));
    });
  });
}

export function createDraw({
  pythonPath = '',
  scriptPath = SCRIPT,
  outDir = path.join(ROOT, 'state', 'draw'),
  timeoutMs = 20000,
  logger = null
} = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  let python = pythonPath;
  let checked = false;

  function resolvePython() {
    if (checked) return python;
    checked = true;
    if (python && canDraw(python)) return python;
    for (const candidate of candidates()) {
      if (candidate === python) continue;
      if (canDraw(candidate)) { python = candidate; break; }
    }
    return python;
  }

  async function render(spec) {
    if (!spec || typeof spec !== 'object' || !Array.isArray(spec.shapes) || !spec.shapes.length) {
      throw new Error('empty drawing');
    }
    const interpreter = resolvePython();
    if (!interpreter || !canDraw(interpreter)) throw new Error('python with Pillow not found');
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const specFile = path.join(outDir, `${stamp}.json`);
    const outFile = path.join(outDir, `${stamp}.png`);
    fs.writeFileSync(specFile, JSON.stringify(spec), 'utf8');
    try {
      await run(interpreter, [scriptPath, '--spec', specFile, '--out', outFile], timeoutMs);
      if (!fs.existsSync(outFile) || fs.statSync(outFile).size < 500) throw new Error('draw output empty');
      logger?.info('draw.rendered', { file: outFile, shapes: spec.shapes.length });
      return { file: outFile, shapes: spec.shapes.length };
    } finally {
      try { fs.rmSync(specFile, { force: true }); } catch { /* best-effort */ }
    }
  }

  async function health() {
    const interpreter = resolvePython();
    return { ok: Boolean(interpreter && canDraw(interpreter)), python: interpreter, script: scriptPath };
  }

  return { render, health };
}
