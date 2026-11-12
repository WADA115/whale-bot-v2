export function handleMindRoutes({ ctx, req, res, json, readBody }) {
  if (req.url === '/api/slang' && req.method === 'GET') {
    return json(res, 200, { list: (ctx.slang || []).slice(-100) });
  }  if (req.url === '/api/mind' && req.method === 'GET') {
    if (!ctx.mind) return json(res, 409, { error: 'mind disabled' });
    return json(res, 200, ctx.mind.read());
  }
  if (req.url === '/api/mind/daydream' && req.method === 'POST') {
    if (!ctx.daydream) return json(res, 409, { error: 'mind disabled' });
    ctx.daydream.run()
      .then((result) => json(res, 200, result))
      .catch((error) => json(res, 502, { error: String(error?.message ?? error) }));
    return true;
  }
  if (req.url === '/api/mind/section' && req.method === 'POST') {
    if (!ctx.mind) return json(res, 409, { error: 'mind disabled' });
    readBody(req).then((body) => {
      const section = String(body?.section || '');
      const result = ctx.mind.writeSection(section, String(body?.text ?? ''));
      return json(res, 200, { ok: true, mind: result });
    }).catch(() => json(res, 400, { error: 'invalid json' }));
    return true;
  }  if (req.url.startsWith('/api/story/people') && req.method === 'GET') {
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
      readBody(req).then(async (body) => {
        const key = String(body?.key || '');
        const person = String(body?.person || '');
        if (!key || !person) return json(res, 400, { error: 'key and person required' });
        const result = await ctx.storyStore.writePerson(key, person, {
          head: body?.head,
          middle: body?.middle,
          tail: body?.tail
        }, ctx.character?.card ?? null);
        return json(res, 200, { ok: true, person: result });
      }).catch(() => json(res, 400, { error: 'invalid json' }));
    return true;
    }
    if (req.url === '/api/story/person/forget' && req.method === 'POST') {
      if (!ctx.storyStore) return json(res, 409, { error: 'story disabled' });
      readBody(req).then(async (body) => {
        const key = String(body?.key || '');
        const person = String(body?.person || '');
        if (!key || !person) return json(res, 400, { error: 'key and person required' });
        await ctx.storyStore.forgetPerson(key, person);
        return json(res, 200, { ok: true });
      }).catch(() => json(res, 400, { error: 'invalid json' }));
    return true;
    }    if (req.url.startsWith('/api/story') && req.method === 'GET') {
      if (!ctx.storyStore) return json(res, 409, { error: 'story disabled' });
      const key = new URL(req.url, 'http://127.0.0.1').searchParams.get('key') || '';
      if (!key) return json(res, 400, { error: 'key required' });
      return json(res, 200, ctx.storyStore.read(key, ctx.character?.card ?? null));
    }
    if (req.url === '/api/story/section' && req.method === 'POST') {
      if (!ctx.storyStore) return json(res, 409, { error: 'story disabled' });
      readBody(req).then(async (body) => {
        const section = String(body.section ?? '');
        if (!['self', 'relationship', 'now'].includes(section)) return json(res, 400, { error: 'invalid section' });
        await ctx.storyStore.writeSection(String(body.key ?? ''), section, String(body.text ?? ''), ctx.character?.card ?? null);
        return json(res, 200, { ok: true });
      }).catch(() => json(res, 400, { error: 'invalid json' }));
    return true;
    }
    if (req.url === '/api/autonomy/tick' && req.method === 'POST') {
      ctx.autonomy.tick().then((fresh) => json(res, 200, { ok: true, count: fresh.length }))
        .catch((error) => json(res, 502, { error: String(error?.message ?? error) }));
    return true;
    }
    if (req.url === '/api/tasks/clear' && req.method === 'POST') {
      ctx.tasks.clear();
      json(res, 200, { ok: true });
    return true;
    }
    if (req.url === '/api/tasks/run' && req.method === 'POST') {
      readBody(req).then(async (body) => {
        const id = String(body?.id || '');
        const result = id
          ? await ctx.taskExecutor.execute(ctx.tasks.get(id))
          : await ctx.taskExecutor.runPending({ limit: Number(body?.limit) || 3 });
        return json(res, 200, { ok: true, result });
      }).catch((error) => json(res, 502, { error: String(error?.message ?? error) }));
    return true;
    }
    if (req.url === '/api/tasks/done' && req.method === 'POST') {
      readBody(req).then((body) => {
        const task = ctx.tasks.update(String(body?.id || ''), 'done');
        if (!task) return json(res, 404, { error: 'task not found' });
        return json(res, 200, { ok: true, task });
      }).catch(() => json(res, 400, { error: 'invalid json' }));
    return true;
    }
    if (req.url === '/api/scenes/clear' && req.method === 'POST') {
      ctx.character?.scenes?.clear();
      json(res, 200, { ok: true });
    return true;
    }
  
  return false;
}
