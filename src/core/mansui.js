import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';

export function createMansui({
  url = 'http://127.0.0.1:9880/tts',
  refAudio = 'E:/AI/GPT-SoVITS/dataset/mansui-ref.wav',
  promptText = '我怕他问的多了会起疑心便干脆装成鸭吧',
  promptLang = 'zh',
  outDir = 'state/voice',
  timeoutMs = 90000,
  pythonPath = 'E:/AI/GPT-SoVITS/.venv/Scripts/python.exe',
  scriptPath = 'E:/AI/GPT-SoVITS/api_v2.py',
  cwd = 'E:/AI/GPT-SoVITS',
  configPath = 'GPT_SoVITS/configs/tts_infer_mansui_clean.yaml',
  idleMs = 300000,
  startTimeoutMs = 30000,
  autoStart = true,
  logger = null
} = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  let server = null;
  let starting = null;
  let idleTimer = null;
  let inflight = 0;

  async function isUp() {
    return await new Promise((resolve) => {
      const socket = net.connect({ host: '127.0.0.1', port: 9880 });
      const done = (v) => { try { socket.destroy(); } catch {} resolve(v); };
      socket.setTimeout(1200);
      socket.once('connect', () => done(true));
      socket.once('timeout', () => done(false));
      socket.once('error', () => done(false));
    });
  }

  async function startServer() {
    if (await isUp()) return;
    if (starting) return starting;
    starting = (async () => {
      logger?.info('mansui.starting', {});
      server = spawn(pythonPath, [scriptPath, '-a', '127.0.0.1', '-p', '9880', '-c', configPath], {
        cwd,
        windowsHide: true,
        detached: true,
        stdio: 'ignore',
        env: {
          ...process.env,
          PYTHONPATH: 'E:/AI/GPT-SoVITS;E:/AI/GPT-SoVITS/GPT_SoVITS',
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1'
        }
      });
      server.unref?.();
      const deadline = Date.now() + startTimeoutMs;
      while (Date.now() < deadline) {
        if (await isUp()) { logger?.info('mansui.started', { pid: server.pid }); return; }
        await new Promise((r) => setTimeout(r, 1200));
      }
      throw new Error('mansui start timeout');
    })().finally(() => { starting = null; });
    return starting;
  }

  function stopServer(reason = 'idle') {
    if (!server) return;
    const pid = server.pid;
    server = null;
    try { spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch {}
    logger?.info('mansui.stopped', { pid, reason });
  }

  function touchIdle() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (inflight === 0) stopServer('idle');
    }, idleMs);
    idleTimer.unref?.();
  }

  async function speak(text) {
    if (autoStart) await startServer();
    if (idleTimer) clearTimeout(idleTimer);
    inflight += 1;
    const body = JSON.stringify({
      text, text_lang: 'zh',
      ref_audio_path: refAudio, prompt_text: promptText, prompt_lang: promptLang,
      text_split_method: 'cut5', batch_size: 1, media_type: 'wav', streaming_mode: false
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: controller.signal });
      if (!res.ok) throw new Error(`mansui http ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1000) throw new Error('mansui empty');
      const file = path.join(outDir, `mansui-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.wav`);
      fs.writeFileSync(file, buf);
      logger?.info('mansui.synthesized', { chars: text.length, bytes: buf.length });
      return file;
    } finally {
      clearTimeout(timer);
      inflight = Math.max(0, inflight - 1);
      if (inflight === 0) touchIdle();
    }
  }

  async function health() {
    return { ok: await isUp(), autoStart, url };
  }

  return { speak, health, stop: () => stopServer('manual') };
}
