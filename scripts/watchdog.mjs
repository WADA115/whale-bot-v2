import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { ROOT } from '../src/config.js';

const healthUrl = 'http://127.0.0.1:3201/healthz';
const lockFile = path.join(ROOT, 'state', 'watchdog.lock');
const logFile = path.join(ROOT, 'state', 'logs', 'watchdog.log');
const snowHome = process.env.SNOWLUMA_DIR || 'E:\\新建文件夹 (3)';
const asrPython = process.env.ASR_PY || 'E:\\AI\\ComfyUI\\venv\\Scripts\\python.exe';
const asrScript = process.env.ASR_SCRIPT || 'E:\\deepseek_qq.bot\\qq-bridge\\src\\asr-server.py';
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

const existing = readLock();
if (existing?.pid && alive(existing.pid) && Number(existing.pid) !== process.pid) {
  let up = false;
  try {
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(3000) });
    up = res.ok;
  } catch {}
  if (up) {
    log(`watchdog already running pid=${existing.pid}`);
    process.exit(0);
  }
  log(`stale watchdog lock pid=${existing.pid}: health is down, taking over`);
}
fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, at: Date.now() }), 'utf8');

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
  if (process.env.GATEWAY_AUTOSTART === '1' && ((!await portOpen(3000)) || (!await portOpen(3001)))) {
    if (now - lastSnowStart > 20000) {
      lastSnowStart = now;
      log('starting SnowLuma');
      const child = spawn(path.join(snowHome, 'node.exe'), ['index.mjs'], {
        cwd: snowHome,
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
      child.unref();
    }
  }
  if (!await portOpen(3199)) {
    if (now - lastAsrStart > 20000) {
      lastAsrStart = now;
      log('starting ASR');
      const child = spawn(asrPython, [asrScript, '--port', '3199'], {
        cwd: 'E:\\deepseek_qq.bot\\qq-bridge',
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
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
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: process.env
  });
  child.unref();
}

let busy = false;
async function tick() {
  if (busy) return;
  busy = true;
  try {
    await ensureServices();
    if (!(await healthy())) {
      log('health check failed');
      startChild();
    }
  } finally {
    busy = false;
  }
}

await tick();
setInterval(tick, 30000);
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
