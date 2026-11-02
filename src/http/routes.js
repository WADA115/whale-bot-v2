import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { json, text, sendFile, readBody, readLogTail, v1Get, publicConfig, applyConfigPatch } from './helpers.js';

const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

export function createPanelHandler(ctx) {
  const { config, logger } = ctx;

  return function handleRequest(req, res) {
    const webRoot = path.join(ctx.root, 'web');
    const pathname = req.url.split('?')[0];

    if (pathname === '/next') {
      res.writeHead(302, { location: '/next/' });
      res.end();
      return;
    }
    if (pathname === '/next/') {
      sendFile(res, path.join(webRoot, 'next', 'index.html'), TYPES['.html'] || 'text/html; charset=utf-8');
      return;
    }
    if (req.url.startsWith('/next/') || req.url.startsWith('/assets/')) {
      const rel = req.url.startsWith('/next/') ? req.url.slice('/next/'.length) : `assets/${req.url.slice('/assets/'.length)}`;
      const file = path.resolve(webRoot, rel.startsWith('assets/') ? rel : path.join('next', rel));
      if (!file.startsWith(webRoot)) return json(res, 403, { error: 'forbidden' });
      sendFile(res, file, TYPES[path.extname(file)] || 'application/octet-stream');
      return;
    }
    if (pathname === '/legacy' || pathname === '/') {
      res.writeHead(302, { location: '/next/' });
      res.end();
      return;
    }
    if (req.url === '/api/state') {
      json(res, 200, ctx.snapshot());
      return;
    }
    if (req.url === '/api/gateway/start-all' && req.method === 'POST') {
      try {
        const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ctx.root, 'scripts', 'start-all.ps1')], {
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
      return;
    }
    if (req.url.startsWith('/api/gateway/logs') && req.method === 'GET') {
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
      return;
    }
    if (req.url === '/api/gateway/restart' && req.method === 'POST') {
      try {
        const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ctx.root, 'scripts', 'restart-v2.ps1')], {
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
      return;
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
      return;
    }
    if (req.url === '/api/capabilities' && req.method === 'GET') {
      Promise.resolve(ctx.capabilities?.snapshot?.())
        .then((result) => json(res, 200, result))
        .catch((error) => json(res, 502, { error: String(error?.message ?? error) }));
      return;
    }    if (req.url === '/api/config' && req.method === 'GET') {
      json(res, 200, publicConfig(config, ctx.configPath));
      return;
    }
    if (req.url === '/api/config' && req.method === 'POST') {
      readBody(req).then((patch) => {
        try {
          applyConfigPatch(config, patch ?? {});
          const safe = JSON.parse(JSON.stringify(config));
          for (const model of safe.models?.text ?? []) delete model.apiKey;
          for (const provider of safe.vision?.providers ?? []) delete provider.apiKey;
          delete safe.gateway?.accessToken;
          delete safe.gateway?.wsAccessToken;
          if (fs.existsSync(ctx.configPath)) fs.copyFileSync(ctx.configPath, `${ctx.configPath}.bak-settings`);
          fs.writeFileSync(ctx.configPath, JSON.stringify(safe, null, 2) + '\n', 'utf8');
          logger.info('config.updated_from_panel', { file: path.basename(ctx.configPath) });
          return json(res, 200, { ok: true, restartRequired: true, config: publicConfig(config, ctx.configPath) });
        } catch (error) {
          return json(res, 400, { error: String(error?.message ?? error) });
        }
      }).catch(() => json(res, 400, { error: 'invalid json' }));
      return;
    }
    if (req.url === '/api/character/export' && req.method === 'GET') {
      if (!ctx.character) return json(res, 409, { error: 'character disabled' });
      const body = JSON.stringify(ctx.character.card, null, 2);
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': 'attachment; filename="character.json"',
        'content-length': Buffer.byteLength(body)
      });
      res.end(body);
      return;
    }
    if (req.url === '/api/export' && req.method === 'GET') {
      const body = JSON.stringify({
        exportedAt: new Date().toISOString(),
        card: ctx.character?.card ?? null,
        scenes: ctx.character?.scenes?.snapshot() ?? {},
        bilibili: ctx.bilibili?.status() ?? { enabled: false, loggedIn: false },
        autonomy: ctx.autonomy.status(),
        story: ctx.storyStore?.listChats() ?? [],
        tasks: ctx.tasks.list({ limit: 200 })
      }, null, 2);
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': 'attachment; filename="character-state.json"',
        'content-length': Buffer.byteLength(body)
      });
      res.end(body);
      return;
    }
    if (req.url.startsWith('/api/story/people') && req.method === 'GET') {
      if (!ctx.storyStore) return json(res, 409, { error: 'story disabled' });
      const key = new URL(req.url, 'http://127.0.0.1').searchParams.get('key') || '';
      if (!key) return json(res, 400, { error: 'key required' });
      return json(res, 200, { people: ctx.storyStore.listPeople(key) });
    }
    if (req.url.startsWith('/api/story/person') && req.method === 'GET') {
      if (!ctx.storyStore) return json(res, 409, { error: 'story disabled' });
      const params = new URL(req.url, 'http://127.0.0.1').searchParams;
      const key = params.get('key') || '';
      const person = params.get('person') || '';
      if (!key || !person) return json(res, 400, { error: 'key and person required' });
      return json(res, 200, ctx.storyStore.readPerson(key, person, ctx.character?.card ?? null));
    }
    if (req.url === '/api/story/person' && req.method === 'POST') {
      if (!ctx.storyStore) return json(res, 409, { error: 'story disabled' });
      readBody(req).then((body) => {
        const key = String(body?.key || '');
        const person = String(body?.person || '');
        if (!key || !person) return json(res, 400, { error: 'key and person required' });
        const result = ctx.storyStore.writePerson(key, person, {
          head: body?.head,
          middle: body?.middle,
          tail: body?.tail
        }, ctx.character?.card ?? null);
        return json(res, 200, { ok: true, person: result });
      }).catch(() => json(res, 400, { error: 'invalid json' }));
      return;
    }
    if (req.url === '/api/story/person/forget' && req.method === 'POST') {
      if (!ctx.storyStore) return json(res, 409, { error: 'story disabled' });
      readBody(req).then((body) => {
        const key = String(body?.key || '');
        const person = String(body?.person || '');
        if (!key || !person) return json(res, 400, { error: 'key and person required' });
        ctx.storyStore.forgetPerson(key, person);
        return json(res, 200, { ok: true });
      }).catch(() => json(res, 400, { error: 'invalid json' }));
      return;
    }    if (req.url.startsWith('/api/story') && req.method === 'GET') {
      if (!ctx.storyStore) return json(res, 409, { error: 'story disabled' });
      const key = new URL(req.url, 'http://127.0.0.1').searchParams.get('key') || '';
      if (!key) return json(res, 400, { error: 'key required' });
      return json(res, 200, ctx.storyStore.read(key, ctx.character?.card ?? null));
    }
    if (req.url === '/api/story/section' && req.method === 'POST') {
      if (!ctx.storyStore) return json(res, 409, { error: 'story disabled' });
      readBody(req).then((body) => {
        const section = String(body.section ?? '');
        if (!['self', 'relationship', 'now'].includes(section)) return json(res, 400, { error: 'invalid section' });
        ctx.storyStore.writeSection(String(body.key ?? ''), section, String(body.text ?? ''), ctx.character?.card ?? null);
        return json(res, 200, { ok: true });
      }).catch(() => json(res, 400, { error: 'invalid json' }));
      return;
    }
    if (req.url.startsWith('/api/qzone/feeds') && req.method === 'GET') {
      const count = Number(new URL(req.url, 'http://127.0.0.1').searchParams.get('count') || 5);
      ctx.gateway.getQzoneFeeds({ count: Math.min(10, Math.max(1, count)) })
        .then((result) => json(res, 200, result))
        .catch((error) => json(res, 502, { error: String(error?.message ?? error) }));
      return;
    }
    if (req.url === '/api/qzone/send' && req.method === 'POST') {
      readBody(req).then((body) => {
        if (body.confirm !== true) return json(res, 400, { error: 'confirm required' });
        const content = String(body.content ?? '').trim();
        if (!content) return json(res, 400, { error: 'content required' });
        const requested = Number(body.ugcRight ?? 64);
        const ugcRight = [1, 4, 64].includes(requested) ? requested : 64;
        const visibility = ugcRight === 1 ? 'public' : ugcRight === 4 ? 'friends' : 'self-only';
        return ctx.gateway.sendQzoneMsg({ content, ugcRight })
          .then((result) => json(res, 200, { ok: true, result, visibility }))
          .catch((error) => json(res, 502, { error: String(error?.message ?? error) }));
      }).catch(() => json(res, 400, { error: 'invalid json' }));
      return;
    }
    if (req.url.startsWith('/api/bilibili/search') && req.method === 'GET') {
      if (!ctx.bilibili) return json(res, 409, { error: 'bilibili disabled' });
      const params = new URL(req.url, 'http://127.0.0.1').searchParams;
      ctx.bilibili.search(params.get('q') || '', Number(params.get('limit') || 5))
        .then((list) => json(res, 200, { list }))
        .catch((error) => json(res, 502, { error: String(error?.message ?? error) }));
      return;
    }
    if (req.url.startsWith('/api/bilibili/popular') && req.method === 'GET') {
      if (!ctx.bilibili) return json(res, 409, { error: 'bilibili disabled' });
      const limit = new URL(req.url, 'http://127.0.0.1').searchParams.get('limit') || 5;
      ctx.bilibili.popular(limit).then((list) => json(res, 200, { list })).catch((error) => json(res, 502, { error: String(error?.message ?? error) }));
      return;
    }
    if (req.url.startsWith('/api/bilibili/video') && req.method === 'GET') {
      if (!ctx.bilibili) return json(res, 409, { error: 'bilibili disabled' });
      const bvid = new URL(req.url, 'http://127.0.0.1').searchParams.get('bvid') || '';
      ctx.bilibili.video(bvid).then((video) => json(res, 200, video)).catch((error) => json(res, 502, { error: String(error?.message ?? error) }));
      return;
    }
    if (req.url === '/api/bilibili/status' && req.method === 'GET') {
      json(res, 200, ctx.bilibili?.status() ?? { enabled: false, loggedIn: false });
      return;
    }
    if (req.url === '/api/bilibili/login' && req.method === 'POST') {
      if (!ctx.bilibili) return json(res, 409, { error: 'bilibili disabled' });
      ctx.bilibili.generate().then((x) => json(res, 200, x)).catch((error) => json(res, 502, { error: String(error?.message ?? error) }));
      return;
    }
    if (req.url === '/api/bilibili/poll' && req.method === 'POST') {
      if (!ctx.bilibili) return json(res, 409, { error: 'bilibili disabled' });
      readBody(req).then((body) => ctx.bilibili.poll(String(body.key ?? '')))
        .then((x) => json(res, 200, x))
        .catch((error) => json(res, 502, { error: String(error?.message ?? error) }));
      return;
    }
    if (req.url === '/api/bilibili/logout' && req.method === 'POST') {
      ctx.bilibili?.logout();
      json(res, 200, { ok: true });
      return;
    }
    if (req.url === '/api/autonomy/tick' && req.method === 'POST') {
      ctx.autonomy.tick().then((fresh) => json(res, 200, { ok: true, count: fresh.length }))
        .catch((error) => json(res, 502, { error: String(error?.message ?? error) }));
      return;
    }
    if (req.url === '/api/tasks/clear' && req.method === 'POST') {
      ctx.tasks.clear();
      json(res, 200, { ok: true });
      return;
    }
    if (req.url === '/api/tasks/run' && req.method === 'POST') {
      readBody(req).then(async (body) => {
        const id = String(body?.id || '');
        const result = id
          ? await ctx.taskExecutor.execute(ctx.tasks.get(id))
          : await ctx.taskExecutor.runPending({ limit: Number(body?.limit) || 3 });
        return json(res, 200, { ok: true, result });
      }).catch((error) => json(res, 502, { error: String(error?.message ?? error) }));
      return;
    }
    if (req.url === '/api/tasks/done' && req.method === 'POST') {
      readBody(req).then((body) => {
        const task = ctx.tasks.update(String(body?.id || ''), 'done');
        if (!task) return json(res, 404, { error: 'task not found' });
        return json(res, 200, { ok: true, task });
      }).catch(() => json(res, 400, { error: 'invalid json' }));
      return;
    }
    if (req.url === '/api/scenes/clear' && req.method === 'POST') {
      ctx.character?.scenes?.clear();
      json(res, 200, { ok: true });
      return;
    }
    if (req.url === '/api/character' && req.method === 'POST') {
      readBody(req).then((body) => {
        if (!ctx.character) return json(res, 409, { error: 'character disabled' });
        const input = body?.card ?? body ?? {};
        const text = (value, max) => String(value ?? '').trim().slice(0, max);
        const list = (value, max) => (Array.isArray(value) ? value : String(value ?? '').split('\n'))
          .map((x) => String(x).trim()).filter(Boolean).slice(0, max);
        const card = {
          ...ctx.character.card,
          name: text(input.name, 40),
          identity: text(input.identity, 1200),
          voice: list(input.voice, 12),
          values: list(input.values, 12),
          boundaries: list(input.boundaries, 12),
          examples: list(input.examples, 20)
        };
        if (!card.name) return json(res, 400, { error: 'name required' });
        if (ctx.character.cardFile && fs.existsSync(ctx.character.cardFile)) fs.copyFileSync(ctx.character.cardFile, `${ctx.character.cardFile}.bak`);
        if (ctx.character.cardFile) fs.writeFileSync(ctx.character.cardFile, JSON.stringify(card, null, 2) + '\n', 'utf8');
        ctx.character.card = card;
        logger.info('character.card_updated', { file: ctx.character.cardFile });
        return json(res, 200, { ok: true, card });
      }).catch(() => json(res, 400, { error: 'invalid json' }));
      return;
    }
    if (req.url === '/simulate' && req.method === 'POST') {
      let raw = '';
      req.on('data', (chunk) => {
        raw += chunk;
        if (raw.length > 100_000) req.destroy();
      });
      req.on('end', () => {
        let body;
        try { body = JSON.parse(raw || '{}'); } catch { return json(res, 400, { error: 'invalid json' }); }
        if (config.mode !== 'shadow' && body.dryRun !== true) {
          return json(res, 403, { error: 'simulate only in shadow mode unless dryRun=true' });
        }
        const text = String(body.text ?? '').trim();
        if (!text) return json(res, 400, { error: 'text required' });
        const kind = body.kind === 'group' ? 'group' : 'private';
        const id = kind === 'group'
          ? String(body.groupId ?? config.allow.groups[0] ?? '')
          : String(body.userId ?? config.allow.private[0] ?? 'sim');
        if (!id) return json(res, 400, { error: 'id required' });
        ctx.dispatch({
          key: `${kind}:${id}`,
          kind,
          id,
          userId: String(body.userId ?? 'sim'),
          selfId: '0',
          messageId: `sim-${Date.now()}`,
          text,
          segments: [],
          at: kind === 'group' ? [String(ctx.gateway.selfId)] : [],
          images: [],
          senderName: String(body.name ?? '模拟用户'),
          dryRun: body.dryRun === true
        });
        return json(res, 202, { ok: true });
      });
      return;
    }
    if (req.url === '/healthz') {
      json(res, 200, ctx.health());
      return;
    }
    if (req.url === '/api/metrics') {
      json(res, 200, { ...ctx.metricsJson(), capabilities: undefined });
      return;
    }
    if (req.url === '/metrics') {
      text(res, 200, ctx.metrics(), 'text/plain; version=0.0.4; charset=utf-8');
      return;
    }
    json(res, 404, { error: 'not found' });
  };
}
