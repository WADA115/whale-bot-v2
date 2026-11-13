import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { ROOT } from '../src/config.js';

const configFile = process.env.WATCHDOG_CONFIG || path.join(ROOT, 'state', 'watchdog.json');
let fileConfig = {};
try { fileConfig = JSON.parse(fs.readFileSync(configFile, 'utf8')); } catch {}
const healthUrl = process.env.WATCHDOG_HEALTH_URL || fileConfig.healthUrl || 'http://127.0.0.1:3201/healthz';
const lockFile = process.env.WATCHDOG_LOCK || fileConfig.lockFile || path.join(ROOT, 'state', 'watchdog.lock');
const logFile = process.env.WATCHDOG_LOG || fileConfig.logFile || path.join(ROOT, 'state', 'logs', 'watchdog.log');
const v1Root = process.env.QQ_BRIDGE_V1_ROOT || fileConfig.v1Root || path.resolve(ROOT, '..', 'qq-bridge');
const snowHome = process.env.SNOWLUMA_DIR || fileConfig.snowHome || '';
const asrPython = process.env.ASR_PY || fileConfig.asrPython || path.join(v1Root, 'venv', 'Scripts', 'python.exe');
const asrScript = process.env.ASR_SCRIPT || fileConfig.asrScript || path.join(v1Root, 'src', 'asr-server.py');
const asrCwd = process.env.ASR_CWD || fileConfig.asrCwd || v1Root;
const v2Root = process.env.WATCHDOG_V2_ROOT || fileConfig.v2Root || ROOT;
fs.mkdirSync(path.dirname(logFile), { recursive: true });

function log(message) {
  const line = `${new Date().toISOString()} ${message}\n`;
  try { fs.appendFileSync(logFile, line, 'utf8'); } catch {}
}

function readLock() {
  try { return JSON.parse(fs.readFileSync(lockFile, 'utf8')); } catch { return null; }
}

function alive(pid) {
  try { process.kill(Number(pid), 0); return true; } catch { return false; }
}

async function claimLock() {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const fd = fs.openSync(lockFile, 'wx');
      try { fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() }), 'utf8'); }
      finally { fs.closeSync(fd); }
      return true;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const existing = readLock();
      if (existing?.pid && Number(existing.pid) !== process.pid && alive(existing.pid)) {
        const age = Date.now() - Number(existing.at || 0);
        if (age < 60_000) {
          log(`watchdog starting or running pid=${existing.pid}`);
          return false;
        }
        let up = false;
        try {
          const res = await fetch(healthUrl, { signal: AbortSignal.timeout(3000) });
          up = res.ok;
        } catch {}
        if (up) {
          log(`watchdog already running pid=${existing.pid}`);
          return false;
        }
        log(`stale watchdog lock pid=${existing.pid}: health is down, taking over`);
      }
      try { fs.rmSync(lockFile, { force: true }); } catch {}
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  return false;
}

if (!await claimLock()) process.exit(0);

if (process.env.WATCHDOG_DRY === '1') {
  log('watchdog dry hold');
  await new Promise((resolve) => setTimeout(resolve, Number(process.env.WATCHDOG_HOLD_MS) || 1500));
  process.exit(0);
}

function touchLock() {
  try { fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, at: Date.now() }), 'utf8'); } catch {}
}

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.setTimeout(1200, () => { socket.destroy(); resolve(false); });
    socket.on('error', () => resolve(false));
  });
}

let lastSnowStart = 0;
let lastAsrStart = 0;
async function ensureServices() {
  const now = Date.now();
  if (snowHome && process.env.GATEWAY_AUTOSTART === '1' && ((!await portOpen(3000)) || (!await portOpen(3001)))) {
    if (now - lastSnowStart > 20000) {
      lastSnowStart = now;
      log('starting SnowLuma');
      const child = spawn(path.join(snowHome, 'node.exe'), ['index.mjs'], {
        cwd: snowHome,
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
      child.on('error', (error) => log('child spawn failed: ' + String(error?.message ?? error)));
  child.unref();
    }
  }
  if (asrPython && asrScript && !await portOpen(3199)) {
    if (now - lastAsrStart > 20000) {
      lastAsrStart = now;
      log('starting ASR');
      const child = spawn(asrPython, [asrScript, '--port', '3199'], {
        cwd: asrCwd,
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
      child.on('error', (error) => log('child spawn failed: ' + String(error?.message ?? error)));
  child.unref();
    }
  }
}

async function healthy() {
  try {
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

function startChild() {
  log('starting v2 child');
  const child = spawn(process.execPath, [path.join(v2Root, 'src', 'index.js')], {
    cwd: v2Root,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: process.env
  });
  child.on('error', (error) => log('child spawn failed: ' + String(error?.message ?? error)));
  child.on('exit', (code) => { if (code && code !== 0) log(`v2 exited code=${code}`); });
  child.unref();
}

let busy = false;
let failures = 0;
let nextStartAt = 0;
async function tick() {
  if (busy) return;
  touchLock();
  busy = true;
  try {
    await ensureServices();
    if (!(await healthy())) {
      failures += 1;
      const delay = Math.min(5 * 60_000, 30_000 * (2 ** Math.min(failures - 1, 4)));
      if (Date.now() >= nextStartAt) {
        log(`health check failed (failure ${failures}), next restart in ${Math.round(delay / 1000)}s`);
        startChild();
        nextStartAt = Date.now() + delay;
      }
    } else {
      failures = 0;
      nextStartAt = 0;
    }
  } finally {
    busy = false;
  }
}

await tick();
setInterval(tick, 30000);
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
