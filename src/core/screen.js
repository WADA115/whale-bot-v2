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

export function createScreen({ root = 'state', scriptPath = '', powershell = 'powershell.exe', intervalMs = 15000, logger = null } = {}) {
  const stateFile = path.join(root, 'screen-state.json');
  const outDir = path.join(root, 'screen');
  fs.mkdirSync(outDir, { recursive: true });
  let enabled = false;
  let continuous = false;
  try {
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    enabled = Boolean(state.enabled);
    continuous = Boolean(state.continuous);
  } catch {}
  if (!enabled) continuous = false;

  let timer = null;
  let capturing = null;

  function persist() {
    try { fs.writeFileSync(stateFile, JSON.stringify({ enabled, continuous }, null, 2) + '\n', 'utf8'); } catch {}
  }

  async function captureTo(out) {
    await run(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-OutFile', out], 15000);
    if (!fs.existsSync(out) || fs.statSync(out).size < 1000) throw new Error('screen capture empty');
    return out;
  }

  async function capture() {
    return captureTo(path.join(outDir, `screen-${Date.now()}.png`));
  }

  function latestFile() { return path.join(outDir, 'latest.png'); }

  function tick() {
    if (capturing) return capturing;
    capturing = captureTo(latestFile())
      .catch((error) => logger?.warn('screen.continuous_failed', { error: String(error?.message ?? error) }))
      .finally(() => { capturing = null; });
    return capturing;
  }

  function stopContinuous() {
    if (timer) clearInterval(timer);
    timer = null;
    continuous = false;
    persist();
  }

  function startContinuous() {
    if (!enabled) return false;
    if (!continuous) {
      continuous = true;
      persist();
    }
    if (!timer) {
      timer = setInterval(tick, Math.max(3000, Number(intervalMs) || 15000));
      timer.unref?.();
    }
    tick();
    return true;
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    if (!enabled) stopContinuous();
    persist();
    return enabled;
  }

  function setContinuous(value) {
    const next = Boolean(value) && enabled;
    if (next) startContinuous();
    else stopContinuous();
    return continuous;
  }

  async function frame() {
    if (continuous && fs.existsSync(latestFile())) {
      const age = Date.now() - fs.statSync(latestFile()).mtimeMs;
      if (age < Math.max(3000, Number(intervalMs) || 15000) * 2) return latestFile();
    }
    return capture();
  }

  if (continuous && enabled) startContinuous();

  return {
    isEnabled: () => enabled,
    isContinuous: () => continuous,
    setEnabled,
    setContinuous,
    startContinuous,
    stopContinuous,
    capture,
    frame,
    outDir
  };
}
