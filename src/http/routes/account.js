import fs from 'node:fs';
import { personaFromText, personaPrompt, personaChatPrompt } from '../persona.js';

export function handleAccountRoutes({ ctx, req, res, json, readBody, pathname }) {
  const { logger } = ctx;
    if (req.url === '/api/milestones' && req.method === 'GET') {
      json(res, 200, { ok: true, entries: (ctx.milestones?.list?.() ?? []).slice(-30).reverse() });
    return true;
    }
    if (req.url === '/api/milestones/delete' && req.method === 'POST') {
      readBody(req).then((body) => {
        const ok = ctx.milestones?.remove?.(Number(body?.at)) ?? false;
        json(res, ok ? 200 : 404, { ok });
      }).catch(() => json(res, 400, { error: 'invalid json' }));
    return true;
    }
    if (req.url === '/api/diary' && req.method === 'GET') {
      json(res, 200, { ok: true, entries: (ctx.diary?.list?.() ?? []).slice(-20).reverse() });
    return true;
    }
    if (req.url === '/api/diary/delete' && req.method === 'POST') {
      readBody(req).then((body) => {
        const ok = ctx.diary?.remove?.(Number(body?.at)) ?? false;
        json(res, ok ? 200 : 404, { ok });
      }).catch(() => json(res, 400, { error: 'invalid json' }));
    return true;
    }
    if (req.url === '/api/memory/contacts' && req.method === 'GET') {
      json(res, 200, { ok: true, contacts: ctx.contacts?.list?.() ?? [] });
    return true;
    }
    if (req.url === '/api/memory/forget' && req.method === 'POST') {
      readBody(req).then((body) => {
        const ok = ctx.contacts?.forget?.({ id: String(body?.id || ''), text: String(body?.text || '') }) ?? false;
        json(res, ok ? 200 : 404, { ok });
      }).catch(() => json(res, 400, { error: 'invalid json' }));
    return true;
    }
    if (req.url === '/api/permissions' && req.method === 'GET') {
      const pending = ctx.permissions?.pending?.() ?? [];
      const active = ctx.permissions?.active?.() ?? [];
      json(res, 200, { ok: true, pending, active });
    return true;
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
    return true;
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
    return true;
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
    return true;
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
    return true;
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
        try { ctx.mind?.syncCard?.(card); } catch { /* best-effort */ }
        logger.info('character.card_updated', { file: ctx.character.cardFile });
        return json(res, 200, { ok: true, card });
      }).catch(() => json(res, 400, { error: 'invalid json' }));
    return true;
    }
  return false;
}
