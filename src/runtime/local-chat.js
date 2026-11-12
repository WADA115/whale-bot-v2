import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';

export function createLocalChat({ gateway, dispatch, media = null, history = null, logger = null, timeoutMs = 45000, maxQueue = 2 } = {}) {
  const turnContext = new AsyncLocalStorage();
  const originalSendText = gateway.sendText.bind(gateway);
  const originalSendMessage = gateway.sendMessage.bind(gateway);
  let active = null;
  let queued = 0;
  let chain = Promise.resolve();

  gateway.sendText = async (kind, id, text) => {
    if (String(id) !== 'local') return originalSendText(kind, id, text);
    if (!active || active.closed || turnContext.getStore() !== active.turnId) {
      logger?.warn('local_chat.no_active_turn', { kind: 'text', inTurn: Boolean(turnContext.getStore()) });
      return { ok: false, reason: 'no-active-turn' };
    }
    active.push(String(text ?? ''));
    return { ok: true };
  };

  gateway.sendMessage = async (kind, id, segments) => {
    if (String(id) !== 'local') return originalSendMessage(kind, id, segments);
    if (!active || active.closed || turnContext.getStore() !== active.turnId) {
      logger?.warn('local_chat.no_active_turn', { kind: 'segments', inTurn: Boolean(turnContext.getStore()) });
      return { ok: false, reason: 'no-active-turn' };
    }
    await active.pushSegments(segments);
    return { ok: true };
  };

  async function cacheSegment(segment) {
    if (!media) return null;
    const type = String(segment?.type || '');
    const data = segment?.data || {};
    try {
      if (type === 'record') {
        const file = data.file || '';
        const url = data.url || '';
        const item = file
          ? media.addFile({ scope: 'her', kind: 'voice', file, mime: 'audio/wav', name: 'voice.wav' })
          : await media.addUrl({ scope: 'her', kind: 'voice', url, mime: 'audio/wav' });
        return { kind: 'voice', url: item.url, mime: item.mime };
      }
      if (type === 'image' || type === 'local-sticker' || type === 'mface') {
        const file = data.file || '';
        const url = data.url || '';
        if (!file && !url) return null;
        const kind = type === 'image' ? 'image' : 'sticker';
        const item = file
          ? media.addFile({ scope: 'her', kind, file, name: kind === 'sticker' ? 'sticker' : 'image' })
          : await media.addUrl({ scope: 'her', kind, url, name: kind === 'sticker' ? 'sticker' : 'image' });
        return { kind, url: item.url, mime: item.mime };
      }
    } catch (error) {
      logger?.warn('local_chat.media_cache_failed', { type, error: String(error?.message ?? error) });
      return null;
    }
    return null;
  }

  function run(text, attachments = [], origin = '') {
    return new Promise((resolve) => {
      const chunks = [];
      const output = [];
      let settled = false;
      let timer = null;
      let deadline = null;
      let turn = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        if (deadline) clearTimeout(deadline);
        if (turn) turn.closed = true;
        if (active === turn) active = null;
        const reply = chunks.join('\n').trim();
        history?.add?.({ role: 'assistant', text: reply, segments: output });
        resolve({ ok: true, reply, segments: output });
      };
      turn = {
        turnId: crypto.randomUUID(),
        closed: false,
        push(value) {
          if (turn.closed) return;
          const body = String(value ?? '').trim();
          if (!body) return;
          chunks.push(body);
          if (!timer) timer = setTimeout(finish, 500);
        },
        async pushSegments(segments) {
          for (const seg of Array.isArray(segments) ? segments : []) {
            if (turn.closed) return;
            const cached = await cacheSegment(seg);
            if (turn.closed) return;
            if (cached?.url) output.push(cached);
            else if (seg?.type === 'record') chunks.push('[语音]');
            else if (seg?.type === 'image' || seg?.type === 'local-sticker' || seg?.type === 'mface') chunks.push('[图片]');
          }
          if (turn.closed) return;
          if (!timer) timer = setTimeout(finish, 500);
        }
      };
      active = turn;

      const base = origin || 'http://127.0.0.1:3201';
      const segments = [];
      for (const attachment of Array.isArray(attachments) ? attachments : []) {
        const kind = String(attachment?.kind || 'image');
        const url = String(attachment?.url || '');
        if (!url) continue;
        let absolute = url;
        try { absolute = new URL(url, base).href; } catch { /* best-effort */ }
        if (kind === 'voice') segments.push({ type: 'record', data: { url: absolute } });
        else segments.push({ type: 'image', data: { file: absolute } });
      }
      history?.add?.({ role: 'user', text: String(text ?? ''), segments: attachments });
      const message = {
        kind: 'private',
        id: 'local',
        key: 'private:local',
        userId: 'local',
        selfId: String(gateway.selfId || ''),
        messageId: `local-${Date.now()}`,
        text: String(text ?? ''),
        segments,
        images: segments.filter((seg) => seg.type === 'image').map((seg) => seg.data),
        voices: segments.filter((seg) => seg.type === 'record').map((seg) => seg.data),
        at: [],
        senderName: '主人',
        local: true,
        raw: null
      };
      Promise.resolve()
        .then(() => turnContext.run(turn.turnId, () => dispatch(message)))
        .catch((error) => {
          logger?.warn('local_chat.dispatch_failed', { error: String(error?.message ?? error) });
          finish();
        });
      deadline = setTimeout(() => { if (!settled) { finish(); logger?.warn('local_chat.timeout', {}); } }, timeoutMs);
    });
  }

  function send(text, attachments = [], options = {}) {
    if (queued >= Math.max(1, Number(maxQueue) || 2)) {
      logger?.warn('local_chat.queue_full', { queued });
      return Promise.resolve({ ok: false, error: 'busy', reason: 'busy' });
    }
    queued += 1;
    const job = chain.then(() => run(text, attachments, options.origin || ''));
    chain = job.catch(() => {});
    return job.finally(() => { queued = Math.max(0, queued - 1); });
  }

  return { send };
}
