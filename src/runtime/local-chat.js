export function createLocalChat({ gateway, dispatch, logger = null, timeoutMs = 90000 } = {}) {
  const originalSendText = gateway.sendText.bind(gateway);
  const originalSendMessage = gateway.sendMessage.bind(gateway);
  let active = null;
  let chain = Promise.resolve();

  gateway.sendText = async (kind, id, text) => {
    if (String(id) !== 'local') return originalSendText(kind, id, text);
    if (active) active.push(String(text ?? ''));
    return { ok: true };
  };

  gateway.sendMessage = async (kind, id, segments) => {
    if (String(id) !== 'local') return originalSendMessage(kind, id, segments);
    if (active) active.pushSegments(segments);
    return { ok: true };
  };

  function run(text) {
    return new Promise((resolve) => {
      const chunks = [];
      let settled = false;
      let timer = null;
      let deadline = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        if (deadline) clearTimeout(deadline);
        active = null;
        resolve({ ok: true, reply: chunks.join('\n').trim() });
      };
      active = {
        push(value) {
          const body = String(value ?? '').trim();
          if (!body) return;
          chunks.push(body);
          if (!timer) timer = setTimeout(finish, 500);
        },
        pushSegments(segments) {
          for (const seg of Array.isArray(segments) ? segments : []) {
            if (seg?.type === 'record') chunks.push('[语音]');
            else if (seg?.type === 'image') chunks.push('[图片]');
            else if (seg?.type === 'mface') chunks.push('[表情]');
          }
          if (!timer) timer = setTimeout(finish, 500);
        }
      };
      const message = {
        kind: 'private',
        id: 'local',
        key: 'private:local',
        userId: 'local',
        selfId: String(gateway.selfId || ''),
        messageId: `local-${Date.now()}`,
        text: String(text ?? ''),
        segments: [],
        images: [],
        voices: [],
        at: [],
        senderName: '主人',
        local: true,
        raw: null
      };
      Promise.resolve()
        .then(() => dispatch(message))
        .catch((error) => {
          logger?.warn('local_chat.dispatch_failed', { error: String(error?.message ?? error) });
          finish();
        });
      deadline = setTimeout(() => { if (!settled) { finish(); logger?.warn('local_chat.timeout', {}); } }, timeoutMs);
    });
  }

  function send(text) {
    const job = chain.then(() => run(text));
    chain = job.catch(() => {});
    return job;
  }

  return { send };
}
