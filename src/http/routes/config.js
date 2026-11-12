import fs from 'node:fs';
import path from 'node:path';
import { publicConfig, applyConfigPatch } from '../helpers.js';

export function handleConfigRoutes({ ctx, config, logger, req, res, json, readBody }) {
    if (req.url === '/api/config' && req.method === 'GET') {
      json(res, 200, publicConfig(config, ctx.configPath));
    return true;
    }
    if (req.url === '/api/config' && req.method === 'POST') {
      readBody(req).then((patch) => {
        try {
          const previous = fs.existsSync(ctx.configPath)
            ? (() => { try { return JSON.parse(fs.readFileSync(ctx.configPath, 'utf8')); } catch { return {}; } })()
            : {};
          applyConfigPatch(config, patch ?? {});
          const safe = JSON.parse(JSON.stringify(config));
          for (const model of safe.models?.text ?? []) {
            const old = (previous.models?.text ?? []).find((item) => item.id === model.id);
            if (old?.apiKey) model.apiKey = old.apiKey;
            else delete model.apiKey;
          }
          for (const provider of safe.vision?.providers ?? []) {
            const old = (previous.vision?.providers ?? []).find((item) => item.id === provider.id);
            if (old?.apiKey) provider.apiKey = old.apiKey;
            else delete provider.apiKey;
          }
          if (previous.gateway?.accessToken) safe.gateway.accessToken = previous.gateway.accessToken;
          else delete safe.gateway?.accessToken;
          if (previous.gateway?.wsAccessToken) safe.gateway.wsAccessToken = previous.gateway.wsAccessToken;
          else delete safe.gateway?.wsAccessToken;
          if (fs.existsSync(ctx.configPath)) {
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            fs.copyFileSync(ctx.configPath, `${ctx.configPath}.bak-settings-${stamp}`);
          }
          const tmp = `${ctx.configPath}.tmp-${process.pid}-${Date.now()}`;
          fs.writeFileSync(tmp, JSON.stringify(safe, null, 2) + '\n', 'utf8');
          fs.renameSync(tmp, ctx.configPath);
          logger.info('config.updated_from_panel', { file: path.basename(ctx.configPath) });
          return json(res, 200, { ok: true, restartRequired: true, config: publicConfig(config, ctx.configPath) });
        } catch (error) {
          return json(res, 400, { error: String(error?.message ?? error) });
        }
      }).catch(() => json(res, 400, { error: 'invalid json' }));
    return true;
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
    return true;
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
    return true;
    }
    if (req.url === '/api/shutdown' && req.method === 'POST') {
    if (!ctx.shutdownToken || req.headers['x-shutdown-token'] !== ctx.shutdownToken) {
      return json(res, 403, { error: 'forbidden' });
    }
    json(res, 202, { ok: true });
    setTimeout(() => ctx.shutdown?.(), 100);
    return true;
  }
  return false;
}
