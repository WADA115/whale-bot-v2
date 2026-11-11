import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

function run(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: 'ignore' });
    const timer = setTimeout(() => { child.kill(); reject(new Error('screen capture timeout')); }, timeoutMs);
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`screen capture exit ${code}`)); });
  });
}

export function createScreen({ root = 'state', scriptPath = '', powershell = 'powershell.exe', logger = null } = {}) {
  const stateFile = path.join(root, 'screen-state.json');
  const outDir = path.join(root, 'screen');
  fs.mkdirSync(outDir, { recursive: true });
  let enabled = false;
  try { enabled = Boolean(JSON.parse(fs.readFileSync(stateFile, 'utf8')).enabled); } catch {}
  function persist() {
    try { fs.writeFileSync(stateFile, JSON.stringify({ enabled }, null, 2) + '\n', 'utf8'); } catch {}
  }
  function isEnabled() { return enabled; }
  function setEnabled(value) { enabled = Boolean(value); persist(); return enabled; }
  async function capture() {
    const out = path.join(outDir, `screen-${Date.now()}.png`);
    await run(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-OutFile', out], 15000);
    if (!fs.existsSync(out) || fs.statSync(out).size < 1000) throw new Error('screen capture empty');
    return out;
  }
  return { isEnabled, setEnabled, capture, outDir };
}
