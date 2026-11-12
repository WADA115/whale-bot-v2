import { handleOpsRoutes } from './routes/ops.js';
import { handleMindRoutes } from './routes/mind.js';
import { handleConfigRoutes } from './routes/config.js';
import { handleBiliRoutes } from './routes/bilibili.js';
import { handleMediaRoutes } from './routes/media.js';
import { TYPES, sendPanelHtml } from './static.js';
import { personaFromText, personaPrompt, personaChatPrompt } from './persona.js';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { json, text, sendFile, readBody, readLogTail, v1Get, publicConfig, applyConfigPatch } from './helpers.js';

export { personaFromText, personaPrompt, personaChatPrompt } from './persona.js';

const POWERSHELL = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

export function createPanelHandler(ctx) {
  const { config, logger } = ctx;

  return function handleRequest(req, res) {
    const webRoot = path.join(ctx.root, 'web');
    const pathname = req.url.split('?')[0];

    if (pathname.startsWith('/api/') && pathname !== '/api/shutdown') {
      const port = Number(config.healthPort) || 3201;
      const host = String(req.headers.host || '').toLowerCase();
      const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
      const origin = String(req.headers.origin || '');
      const site = String(req.headers['sec-fetch-site'] || '');
      const allowedOrigins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
      if (!allowedHosts.has(host)) return json(res, 403, { error: 'forbidden host' });
      if (origin && !allowedOrigins.has(origin)) return json(res, 403, { error: 'forbidden origin' });
      if (site === 'cross-site') return json(res, 403, { error: 'forbidden origin' });
    }
    const needsPanelToken = pathname.startsWith('/api/') && pathname !== '/api/shutdown' && pathname !== '/api/local/history';
    if (needsPanelToken && String(req.headers['x-panel-token'] || '') !== String(ctx.panelToken || '')) {
      return json(res, 403, { error: 'missing panel token' });
    }

    if (pathname.startsWith('/media/')) {
      const rel = pathname.slice('/media/'.length);
      const file = path.resolve(path.join(ctx.root, 'state', 'media'), rel);
      const mediaRoot = path.resolve(path.join(ctx.root, 'state', 'media'));
      if (!file.startsWith(mediaRoot + path.sep)) return json(res, 403, { error: 'forbidden' });
      sendFile(res, file, TYPES[path.extname(file)] || 'application/octet-stream');
      return;
    }    if (pathname === '/next') {
      res.writeHead(302, { location: '/next/' });
      res.end();
      return;
    }
    if (pathname === '/next/') {
      sendPanelHtml(res, path.join(webRoot, 'next', 'index.html'), ctx.panelToken);
      return;
    }
    if (req.url.startsWith('/next/') || req.url.startsWith('/assets/')) {
      const rel = req.url.startsWith('/next/') ? req.url.slice('/next/'.length) : `assets/${req.url.slice('/assets/'.length)}`;
      const file = path.resolve(webRoot, rel.startsWith('assets/') ? rel : path.join('next', rel));
      if (!file.startsWith(webRoot + path.sep)) return json(res, 403, { error: 'forbidden' });
      if (path.extname(file).toLowerCase() === '.html') sendPanelHtml(res, file, ctx.panelToken);
      else sendFile(res, file, TYPES[path.extname(file)] || 'application/octet-stream');
      return;
    }
    if (pathname === '/legacy' || pathname === '/') {
      res.writeHead(302, { location: '/next/' });
      res.end();
      return;
    }
    if (req.url === '/api/milestones' && req.method === 'GET') {
      json(res, 200, { ok: true, entries: (ctx.milestones?.list?.() ?? []).slice(-30).reverse() });
      return;
    }
    if (req.url === '/api/milestones/delete' && req.method === 'POST') {
      readBody(req).then((body) => {
        const ok = ctx.milestones?.remove?.(Number(body?.at)) ?? false;
        json(res, ok ? 200 : 404, { ok });
      }).catch(() => json(res, 400, { error: 'invalid json' }));
      return;
    }
    if (req.url === '/api/diary' && req.method === 'GET') {
      json(res, 200, { ok: true, entries: (ctx.diary?.list?.() ?? []).slice(-20).reverse() });
      return;
    }
    if (req.url === '/api/diary/delete' && req.method === 'POST') {
      readBody(req).then((body) => {
        const ok = ctx.diary?.remove?.(Number(body?.at)) ?? false;
        json(res, ok ? 200 : 404, { ok });
      }).catch(() => json(res, 400, { error: 'invalid json' }));
      return;
    }
    if (req.url === '/api/memory/contacts' && req.method === 'GET') {
      json(res, 200, { ok: true, contacts: ctx.contacts?.list?.() ?? [] });
      return;
    }
    if (req.url === '/api/memory/forget' && req.method === 'POST') {
      readBody(req).then((body) => {
        const ok = ctx.contacts?.forget?.({ id: String(body?.id || ''), text: String(body?.text || '') }) ?? false;
        json(res, ok ? 200 : 404, { ok });
      }).catch(() => json(res, 400, { error: 'invalid json' }));
      return;
    }
    if (req.url === '/api/permissions' && req.method === 'GET') {
      const pending = ctx.permissions?.pending?.() ?? [];
      const active = ctx.permissions?.active?.() ?? [];
      json(res, 200, { ok: true, pending, active });
      return;
    }
    if (req.url === '/api/permissions/action' && req.method === 'POST') {
      readBody(req).then((body) => {
        const action = String(body?.action || '');
        const id = String(body?.id || '');
        let item = null;
        if (action === 'approve' || action === 'deny') item = ctx.permissions?.decide?.(id, action === 'approve');
        else if (action === 'revoke') item = ctx.permissions?.decide?.(id, false);
        else if (action === 'adjust') item = ctx.permissions?.adjust?.(id, {
          addMinutes: Number(body?.addMinutes) || 0,
          setMinutes: Number(body?.setMinutes) || 0,
          exclude: Array.isArray(body?.exclude) ? body.exclude : []
        });
        if (!item) return json(res, 404, { error: 'no such permission' });
        json(res, 200, { ok: true, item });
      }).catch(() => json(res, 400, { error: 'invalid json' }));
      return;
    }
  if (pathname === '/api/persona/draft' && req.method === 'POST') {
      readBody(req).then(async (body) => {
        if (!ctx.textRouter) return json(res, 503, { error: 'text model unavailable' });
        const brief = String(body?.brief ?? '').trim();
        if (!brief) return json(res, 400, { error: 'brief required' });
        try {
          const result = await ctx.textRouter.generate(personaPrompt(brief));
          const card = personaFromText(result.text, ctx.character?.card);
          logger.info('persona.drafted', { provider: result.provider });
          return json(res, 200, { ok: true, card });
        } catch (error) {
          logger.warn('persona.draft_failed', { error: String(error?.message ?? error) });
          return json(res, 502, { error: String(error?.message ?? error) });
        }
      }).catch(() => json(res, 400, { error: 'invalid json' }));
      return;
    }
    if (pathname === '/api/persona/refine' && req.method === 'POST') {
      readBody(req).then(async (body) => {
        if (!ctx.textRouter) return json(res, 503, { error: 'text model unavailable' });
        const instruction = String(body?.instruction ?? '').trim();
        if (!instruction) return json(res, 400, { error: 'instruction required' });
        const current = body?.card && typeof body.card === 'object' ? body.card : ctx.character?.card;
        if (!current) return json(res, 409, { error: 'character unavailable' });
        try {
          const result = await ctx.textRouter.generate(personaPrompt('', current, instruction));
          const card = personaFromText(result.text, current);
          logger.info('persona.refined', { provider: result.provider });
          return json(res, 200, { ok: true, card });
        } catch (error) {
          logger.warn('persona.refine_failed', { error: String(error?.message ?? error) });
          return json(res, 502, { error: String(error?.message ?? error) });
        }
      }).catch(() => json(res, 400, { error: 'invalid json' }));
      return;
    }
    if (pathname === '/api/persona/chat' && req.method === 'POST') {
      readBody(req).then(async (body) => {
        if (!ctx.textRouter) return json(res, 503, { error: 'text model unavailable' });
        const message = String(body?.message ?? '').trim();
        if (!message) return json(res, 400, { error: 'message required' });
        const current = body?.card && typeof body.card === 'object' ? body.card : ctx.character?.card;
        const history = Array.isArray(body?.history) ? body.history : [];
        try {
          const result = await ctx.textRouter.generate(personaChatPrompt({ history, message, current }));
          const raw = String(result?.text || '').trim();
          let card = null;
          if (raw.includes('{')) {
            try { card = personaFromText(raw, current); } catch { card = null; }
          }
          logger.info('persona.chatted', { provider: result.provider, card: Boolean(card) });
          return json(res, 200, { ok: true, reply: card ? '写好了，看看像不像。' : raw, card });
        } catch (error) {
          logger.warn('persona.chat_failed', { error: String(error?.message ?? error) });
          return json(res, 502, { error: String(error?.message ?? error) });
        }
      }).catch(() => json(res, 400, { error: 'invalid json' }));
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
          drive: text(input.drive, 1200),
          voice: list(input.voice, 12),
          world: list(input.world, 20),
          boundaries: list(input.boundaries, 12),
          views: list(input.views, 12),
          taste: list(input.taste, 12),
          line: list(input.line, 12),
          selfImage: text(input.selfImage, 600),
          examples: list(input.examples, 20)
        };
        if (!card.name) return json(res, 400, { error: 'name required' });
        if (ctx.character.cardFile && fs.existsSync(ctx.character.cardFile)) fs.copyFileSync(ctx.character.cardFile, `${ctx.character.cardFile}.bak`);
        if (ctx.character.cardFile) fs.writeFileSync(ctx.character.cardFile, JSON.stringify(card, null, 2) + '\n', 'utf8');
        ctx.character.card = card;
        try { ctx.mind?.syncCard?.(card); } catch {}
        logger.info('character.card_updated', { file: ctx.character.cardFile });
        return json(res, 200, { ok: true, card });
      }).catch(() => json(res, 400, { error: 'invalid json' }));
      return;
    }
  if (handleOpsRoutes({ ctx, config, req, res, json, readBody })) return;
  if (handleMindRoutes({ ctx, req, res, json, readBody })) return;
  if (handleConfigRoutes({ ctx, config, logger, req, res, json, readBody })) return;
  if (handleBiliRoutes({ ctx, req, res, json, readBody })) return;
  if (handleMediaRoutes({ ctx, req, res, json, readBody })) return;
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
