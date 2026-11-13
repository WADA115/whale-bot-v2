export function handleBiliRoutes({ ctx, req, res, json, readBody }) {
    if (req.url.startsWith('/api/qzone/feeds') && req.method === 'GET') {
      const count = Number(new URL(req.url, 'http://127.0.0.1').searchParams.get('count') || 5);
      ctx.gateway.getQzoneFeeds({ count: Math.min(10, Math.max(1, count)) })
        .then((result) => json(res, 200, result))
        .catch((error) => json(res, 502, { error: String(error?.message ?? error) }));
    return true;
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
    return true;
    }
    if (req.url.startsWith('/api/bilibili/search') && req.method === 'GET') {
      if (!ctx.bilibili) return json(res, 409, { error: 'bilibili disabled' });
      const params = new URL(req.url, 'http://127.0.0.1').searchParams;
      ctx.bilibili.search(params.get('q') || '', Number(params.get('limit') || 5))
        .then((list) => json(res, 200, { list }))
        .catch((error) => json(res, 502, { error: String(error?.message ?? error) }));
    return true;
    }
    if (req.url.startsWith('/api/bilibili/popular') && req.method === 'GET') {
      if (!ctx.bilibili) return json(res, 409, { error: 'bilibili disabled' });
      const limit = new URL(req.url, 'http://127.0.0.1').searchParams.get('limit') || 5;
      ctx.bilibili.popular(limit).then((list) => json(res, 200, { list })).catch((error) => json(res, 502, { error: String(error?.message ?? error) }));
    return true;
    }
    if (req.url === '/api/bilibili/see' && req.method === 'POST') {
    if (!ctx.mind) return json(res, 409, { error: 'mind disabled' });
    readBody(req).then(async (body) => {
      const bvid = String(body?.bvid || '').trim();
      let title = String(body?.title || '').trim();
      let owner = String(body?.owner || '').trim();
      if (!/^BV[0-9A-Za-z]{10}$/.test(bvid)) return json(res, 400, { error: 'invalid bvid' });
      let text = '';
      try {
        const item = await ctx.bilibili.content(bvid);
        title = item.title || title;
        owner = item.owner || owner;
        text = String(item.desc || '').trim();
      } catch { /* best-effort */ }
      if (!title) return json(res, 400, { error: 'title required' });
      const header = [title, bvid, owner].filter(Boolean).join('｜');
      const line = text ? `${header}\n${text.slice(0, 2500)}` : header;
      const result = ctx.mind.appendSeen(line);
      ctx.mind.setPendingRead?.({ bvid, title });
      return json(res, 200, { ok: true, content: Boolean(text), pendingRead: true, seen: result.seen });
    }).catch(() => json(res, 400, { error: 'invalid json' }));
    return true;
  }  if (req.url.startsWith('/api/bilibili/content') && req.method === 'GET') {
    if (!ctx.bilibili) return json(res, 409, { error: 'bilibili disabled' });
    const bvid = new URL(req.url, 'http://127.0.0.1').searchParams.get('bvid') || '';
    ctx.bilibili.content(bvid).then((x) => json(res, 200, x)).catch((error) => json(res, 502, { error: String(error?.message ?? error) }));
    return true;
  }
  if (req.url.startsWith('/api/bilibili/dynamics') && req.method === 'GET') {
    if (!ctx.bilibili) return json(res, 409, { error: 'bilibili disabled' });
    ctx.bilibili.dynamics().then((list) => json(res, 200, { list })).catch((error) => json(res, 502, { error: String(error?.message ?? error) }));
    return true;
  }
  if (req.url.startsWith('/api/bilibili/favorites') && req.method === 'GET') {
    if (!ctx.bilibili) return json(res, 409, { error: 'bilibili disabled' });
    ctx.bilibili.favorites().then((list) => json(res, 200, { list })).catch((error) => json(res, 502, { error: String(error?.message ?? error) }));
    return true;
  }
  if (req.url.startsWith('/api/bilibili/history') && req.method === 'GET') {
    if (!ctx.bilibili) return json(res, 409, { error: 'bilibili disabled' });
    ctx.bilibili.history().then((list) => json(res, 200, { list })).catch((error) => json(res, 502, { error: String(error?.message ?? error) }));
    return true;
  }  if (req.url.startsWith('/api/bilibili/video') && req.method === 'GET') {
      if (!ctx.bilibili) return json(res, 409, { error: 'bilibili disabled' });
      const bvid = new URL(req.url, 'http://127.0.0.1').searchParams.get('bvid') || '';
      ctx.bilibili.video(bvid).then((video) => json(res, 200, video)).catch((error) => json(res, 502, { error: String(error?.message ?? error) }));
    return true;
    }
    if (req.url === '/api/bilibili/status' && req.method === 'GET') {
      json(res, 200, ctx.bilibili?.status() ?? { enabled: false, loggedIn: false });
    return true;
    }
    if (req.url === '/api/bilibili/login' && req.method === 'POST') {
      if (!ctx.bilibili) return json(res, 409, { error: 'bilibili disabled' });
      ctx.bilibili.generate().then((x) => json(res, 200, x)).catch((error) => json(res, 502, { error: String(error?.message ?? error) }));
    return true;
    }
    if (req.url === '/api/bilibili/poll' && req.method === 'POST') {
      if (!ctx.bilibili) return json(res, 409, { error: 'bilibili disabled' });
      readBody(req).then((body) => ctx.bilibili.poll(String(body.key ?? '')))
        .then((x) => json(res, 200, x))
        .catch((error) => json(res, 502, { error: String(error?.message ?? error) }));
    return true;
    }
    if (req.url === '/api/bilibili/logout' && req.method === 'POST') {
      ctx.bilibili?.logout();
      json(res, 200, { ok: true });
    return true;
    }

  return false;
}
