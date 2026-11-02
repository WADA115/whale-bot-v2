export function createLiveGroup({ limit = 20 } = {}) {
  const rooms = new Map();

  function observe(message) {
    if (!message || message.kind !== 'group' || !message.key) return;
    const text = String(message.text ?? '').trim();
    if (!text && !(message.images || []).length) return;
    const line = `${String(message.senderName || message.userId || '群友').slice(0, 24)}：${text || '[图片]'}`;
    const lines = rooms.get(message.key) || [];
    lines.push(line);
    while (lines.length > limit) lines.shift();
    rooms.set(message.key, lines);
  }

  function recent(key) {
    return [...(rooms.get(key) || [])];
  }

  return { observe, recent };
}
