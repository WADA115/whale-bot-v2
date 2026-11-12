export async function handleMediaRoutes({ ctx, req, res, json, readBody }) {
  const { config, logger } = ctx;
  const { url } = req;
    if (req.url === '/api/local/history' && req.method === 'GET') {
    const turns = ctx.localHistory?.recent?.(60) ?? [];
    json(res, 200, { ok: true, turns });
    return true;
  }
  if (req.url === '/api/screen' && req.method === 'GET') {
    json(res, 200, { ok: true, enabled: Boolean(ctx.screen?.isEnabled?.()), continuous: Boolean(ctx.screen?.isContinuous?.()) });
    return true;
  }

  if (req.url === '/api/screen' && req.method === 'POST') {
    readBody(req).then((body) => {
      if (body?.enabled !== undefined) ctx.screen?.setEnabled?.(Boolean(body.enabled));
      if (body?.continuous !== undefined) ctx.screen?.setContinuous?.(Boolean(body.continuous));
      json(res, 200, { ok: true, enabled: Boolean(ctx.screen?.isEnabled?.()), continuous: Boolean(ctx.screen?.isContinuous?.()) });
    }).catch(() => json(res, 400, { error: 'invalid json' }));
    return true;
  }

  if (req.url === '/api/screen/capture' && req.method === 'POST') {
    if (!ctx.screen?.isEnabled?.()) return json(res, 403, { error: '屏幕权限未开启' });
    Promise.resolve().then(async () => {
      if (!ctx.screen?.capture || !ctx.mediaLibrary) throw new Error('screen unavailable');
      const file = await ctx.screen.capture();
      const item = ctx.mediaLibrary.addFile({ scope: 'user', kind: 'image', file, mime: 'image/png', name: 'screen.png', origin: 'screen' });
      json(res, 200, { ok: true, item });
    }).catch((error) => json(res, 500, { error: String(error?.message ?? error) }));
    return true;
  }
  if (req.url === '/api/stickers/import-qq' && req.method === 'POST') {
    if (!ctx.importQQStickers) return json(res, 503, { error: 'sticker import unavailable' });
    ctx.importQQStickers().catch((error) => logger?.warn('stickers.import_failed', { error: String(error?.message ?? error) }));
    json(res, 200, { ok: true, started: true });
    return true;
  }
  if (req.url === '/api/local/upload' && req.method === 'POST') {
    readBody(req, 24_000_000).then((body) => {
      if (!ctx.mediaLibrary) return json(res, 503, { error: 'media library unavailable' });
      const kind = String(body?.kind || 'image');
      if (!['image', 'sticker', 'voice'].includes(kind)) return json(res, 400, { error: 'invalid kind' });
      const data = String(body?.data || '');
      if (!data) return json(res, 400, { error: 'data required' });
      const buffer = Buffer.from(data, 'base64');
      const item = ctx.mediaLibrary.addBuffer({
        scope: 'user', kind, buffer,
        mime: String(body?.mime || ''),
        name: String(body?.name || ''),
        origin: 'local-upload'
      });
      json(res, 200, { ok: true, item });
    }).catch((error) => json(res, 400, { error: String(error?.message ?? error) }));
    return true;
  }

  if (req.url === '/api/media/delete' && req.method === 'POST') {
    readBody(req).then((body) => {
      const ok = ctx.mediaLibrary?.remove?.(String(body?.scope || 'user'), String(body?.id || '')) ?? false;
      json(res, ok ? 200 : 404, { ok });
    }).catch(() => json(res, 400, { error: 'invalid json' }));
    return true;
  }
  if (req.url.startsWith('/api/media/list') && req.method === 'GET') {
    const url = new URL(req.url, 'http://127.0.0.1');
    const scope = url.searchParams.get('scope') === 'her' ? 'her' : 'user';
    const kind = String(url.searchParams.get('kind') || '');
    json(res, 200, { ok: true, items: ctx.mediaLibrary?.list?.(scope, kind) ?? [] });
    return true;
  }

  if (req.url === '/api/local/chat' && req.method === 'POST') {
    readBody(req, 24_000_000).then(async (body) => {
      const text = String(body?.text ?? '').trim();
      const attachments = Array.isArray(body?.attachments)
        ? body.attachments.filter((x) => x && /^\/media\/user\//.test(String(x.url || ''))).map((x) => ({
          kind: String(x.kind || 'image'),
          url: String(x.url || '')
        }))
        : [];
      if (!text && !attachments.length) return json(res, 400, { error: 'text or attachment required' });
      if (!ctx.localChat?.send) return json(res, 503, { error: 'local chat unavailable' });
      const origin = `http://${req.headers.host || '127.0.0.1:3201'}`;
      const result = await ctx.localChat.send(text, attachments, { origin });
      json(res, result?.reason === 'busy' ? 429 : 200, result);
    }).catch((error) => json(res, 500, { error: String(error?.message ?? error) }));
    return true;
  }

  return false;
}
