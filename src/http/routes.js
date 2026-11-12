import { handleAccountRoutes } from './routes/account.js';
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
  if (handleAccountRoutes({ ctx, req, res, json, readBody, pathname })) return;
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
