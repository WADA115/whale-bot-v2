export function createConversationLog({ limit = 60 } = {}) {
  const items = [];
  function add({ key = '', kind = '', id = '', sender = '', text = '', at = Date.now() } = {}) {
    const body = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 240);
    if (!body) return;
    items.push({ key, kind, id, sender: String(sender || '').slice(0, 24), text: body, at });
    while (items.length > limit) items.shift();
  }
  function recent({ excludeKey = '', limit: n = 12 } = {}) {
    return items.filter((x) => x.key !== excludeKey).slice(-n);
  }
  function format({ excludeKey = '', limit: n = 12, redactPrivate = false } = {}) {
    return recent({ excludeKey, limit: n }).map((x) => {
      const where = x.kind === 'group' ? `群${x.id}` : '私聊';
      if (redactPrivate && x.kind === 'private') return `${where} ${x.sender || '对方'}：说过一件事（原话不展开）`;
      return `${where} ${x.sender || '对方'}：${x.text}`;
    }).join('\n');
  }
  return { add, recent, format, items };
}
