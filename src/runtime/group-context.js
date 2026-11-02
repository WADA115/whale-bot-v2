export function createGroupContext({ limit = 12 } = {}) {
  const rooms = new Map();

  function observe(message) {
    if (!message || message.kind !== 'group' || !message.key) return;
    const text = String(message.text ?? '').trim();
    if (!text && !(message.images || []).length) return;
    const entry = {
      id: String(message.messageId ?? ''),
      name: String(message.senderName || message.userId || '群友').slice(0, 24),
      text: text || '[图片]'
    };
    const list = rooms.get(message.key) || [];
    list.push(entry);
    while (list.length > limit) list.shift();
    rooms.set(message.key, list);
  }

  function format(key, excludeId = '') {
    const list = (rooms.get(key) || []).filter((entry) => entry.id !== String(excludeId));
    if (!list.length) return '';
    return ['群里刚才：', ...list.map((entry) => `${entry.name}：${entry.text}`)].join('\n');
  }

  return { observe, format };
}
