import path from 'node:path';
import { spawn } from 'node:child_process';
import { readLogTail, v1Get } from '../helpers.js';

const POWERSHELL = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

export function handleOpsRoutes({ ctx, config, req, res, json, readBody }) {
    if (req.url === '/api/ai/start' && req.method === 'POST') {
    try {
      const script = path.join(ctx.root, 'scripts', 'start-ai.ps1');
      const child = spawn(POWERSHELL, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], {
        cwd: ctx.root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
      });
      let output = '';
      child.stdout.on('data', (chunk) => { output += String(chunk); });
      child.stderr.on('data', (chunk) => { output += String(chunk); });
      child.on('close', () => json(res, 200, { ok: true, message: 'AI 服务已启动', output: output.trim() }));
      child.on('error', (error) => json(res, 502, { error: String(error?.message ?? error) }));
    } catch (error) {
      json(res, 502, { error: String(error?.message ?? error) });
    }
    return true;
  }
  if (req.url === '/api/ai/stop' && req.method === 'POST') {
    try {
      const script = path.join(ctx.root, 'scripts', 'stop-ai.ps1');
      const child = spawn(POWERSHELL, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], {
        cwd: ctx.root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
      });
      let output = '';
      child.stdout.on('data', (chunk) => { output += String(chunk); });
      child.stderr.on('data', (chunk) => { output += String(chunk); });
      child.on('close', () => json(res, 200, { ok: true, message: 'AI 服务已关闭', output: output.trim() }));
      child.on('error', (error) => json(res, 502, { error: String(error?.message ?? error) }));
    } catch (error) {
      json(res, 502, { error: String(error?.message ?? error) });
    }
    return true;
  }
  if (req.url === '/api/voice/stop' && req.method === 'POST') {
      try {
        ctx.mansui?.stop?.();
        json(res, 200, { ok: true, message: '满穗语音服务已停止' });
      } catch (error) {
        json(res, 502, { error: String(error?.message ?? error) });
      }
    return true;
    }
    if (req.url === '/api/voice/status' && req.method === 'GET') {
      try {
        if (!ctx.mansui) { json(res, 200, { ok: false }); return true; }
        ctx.mansui.health().then((status) => json(res, 200, { ok: true, ...status })).catch((error) => json(res, 200, { ok: false, error: String(error?.message ?? error) }));
    return true;
      } catch (error) {
        json(res, 200, { ok: false, error: String(error?.message ?? error) });
      }
    return true;
    }
    if (req.url === '/api/state') {
      json(res, 200, ctx.snapshot());
    return true;
    }
    if (req.url === '/api/gateway/start-all' && req.method === 'POST') {
      try {
        const child = spawn(POWERSHELL, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ctx.root, 'scripts', 'start-all.ps1')], {
          cwd: ctx.root,
          detached: true,
          stdio: 'ignore',
          windowsHide: true
        });
        child.unref();
        json(res, 200, { ok: true, message: '启动脚本已提交' });
      } catch (error) {
        json(res, 502, { error: String(error?.message ?? error) });
      }
    return true;
    }
    if (req.url === '/api/gateway/start' && req.method === 'POST') {
      try {
        const child = spawn(POWERSHELL, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ctx.root, 'scripts', 'start-gateway.ps1')], {
          cwd: ctx.root, stdio: 'ignore', windowsHide: true
        });
        child.unref();
        setTimeout(() => { try { ctx.gateway.reopen?.() ?? ctx.gateway.connect(); } catch {} }, 2500);
        json(res, 200, { ok: true, message: '网关启动已提交' });
      } catch (error) {
        json(res, 502, { error: String(error?.message ?? error) });
      }
    return true;
    }
    if (req.url === '/api/gateway/stop' && req.method === 'POST') {
      try {
        const child = spawn(POWERSHELL, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ctx.root, 'scripts', 'stop-gateway.ps1')], {
          cwd: ctx.root, stdio: 'ignore', windowsHide: true
        });
        child.unref();
        try { ctx.gateway.close(); } catch {}
        json(res, 200, { ok: true, message: '网关关闭已提交' });
      } catch (error) {
        json(res, 502, { error: String(error?.message ?? error) });
      }
    return true;
    }
    if (req.url === '/api/runtime/stop-all' && req.method === 'POST') {
      try {
        const child = spawn(POWERSHELL, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ctx.root, 'scripts', 'stop-all.ps1')], {
          cwd: ctx.root, stdio: 'ignore', windowsHide: true
        });
        child.unref();
        json(res, 200, { ok: true, message: '关闭已提交' });
      } catch (error) {
        json(res, 502, { error: String(error?.message ?? error) });
      }
    return true;
    }    if (req.url.startsWith('/api/gateway/logs') && req.method === 'GET') {
      const type = new URL(req.url, 'http://127.0.0.1').searchParams.get('type') || 'v2';
      const files = {
        v2: path.join(ctx.root, 'state', 'logs', 'v2.jsonl'),
        watchdog: path.join(ctx.root, 'state', 'logs', 'watchdog.log'),
        start: path.join(ctx.root, 'state', 'logs', 'start-all.log'),
        runtime: path.join(ctx.root, 'state', 'runtime.log')
      };
      const file = files[type];
      if (!file) return json(res, 400, { error: 'unknown log type' });
      return json(res, 200, { type, text: readLogTail(file, 160) });
    }
    if (req.url === '/api/gateway/test-send' && req.method === 'POST') {
      if (!ctx.isConnected()) return json(res, 409, { error: 'gateway not connected' });
      readBody(req).then(async (body) => {
        const kind = body?.kind === 'group' ? 'group' : 'private';
        const id = String(body?.id || (kind === 'private' ? config.allow.private?.[0] : config.allow.groups?.[0]) || '').trim();
        const text = String(body?.text || '在吗').trim().slice(0, 300);
        if (!id || !text) return json(res, 400, { error: 'id and text required' });
        try {
          await ctx.gateway.sendText(kind, id, text);
          return json(res, 200, { ok: true, kind, id });
        } catch (error) {
          return json(res, 502, { error: String(error?.message ?? error) });
        }
      }).catch(() => json(res, 400, { error: 'invalid json' }));
    return true;
    }
    if (req.url === '/api/gateway/restart' && req.method === 'POST') {
      try {
        const child = spawn(POWERSHELL, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ctx.root, 'scripts', 'restart-v2.ps1')], {
          cwd: ctx.root,
          detached: true,
          stdio: 'ignore',
          windowsHide: true
        });
        child.unref();
        json(res, 200, { ok: true, message: '重启脚本已提交' });
      } catch (error) {
        json(res, 502, { error: String(error?.message ?? error) });
      }
    return true;
    }
    if (req.url === '/api/gateway/overview' && req.method === 'GET') {
      Promise.allSettled([v1Get('/api/status', ctx.root), v1Get('/api/sessions', ctx.root), v1Get('/api/pending', ctx.root)])
        .then(([statusR, sessionsR, pendingR]) => {
          const v1 = statusR.status === 'fulfilled' ? statusR.value : null;
          const sessions = sessionsR.status === 'fulfilled' ? sessionsR.value : null;
          const pending = pendingR.status === 'fulfilled' ? pendingR.value : null;
          json(res, 200, {
            v2: ctx.snapshot(),
            v1: v1 ? {
              mode: v1.mode,
              role: v1.role,
              ownerQQ: v1.ownerQQ,
              dshReady: v1.dshReady,
              snowluma: v1.snowluma,
              allowGroups: v1.allowGroups,
              allowPrivate: v1.allowPrivate,
              socialV2Paused: v1.socialV2Paused,
              activity: String(v1.activity ?? '').split('\n').slice(-60).join('\n')
            } : null,
            sessions,
            pending,
            errors: {
              status: statusR.status === 'rejected' ? String(statusR.reason?.message ?? statusR.reason) : null,
              sessions: sessionsR.status === 'rejected' ? String(sessionsR.reason?.message ?? sessionsR.reason) : null,
              pending: pendingR.status === 'rejected' ? String(pendingR.reason?.message ?? pendingR.reason) : null
            }
          });
        })
        .catch((error) => json(res, 502, { error: String(error?.message ?? error) }));
    return true;
    }
    if (req.url === '/api/capabilities' && req.method === 'GET') {
      Promise.resolve(ctx.capabilities?.snapshot?.())
        .then((result) => json(res, 200, result))
        .catch((error) => json(res, 502, { error: String(error?.message ?? error) }));
    return true;
    }
  return false;
}
