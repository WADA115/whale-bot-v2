export function createLiveGroup({ limit = 20 } = {}) {
  const rooms = new Map();

  function observe(message) {
    if (!message || message.kind !== 'group' || !message.key) return;
    const text = String(message.text ?? '').trim();
    if (!text && !(message.images || []).length) return;
    const line = `${String(message.senderName || message.userId || '群友').slice(0, 24)}：${text || '[图片]'}`;
    const room = rooms.get(message.key) || { name: '', lines: [] };
    if (message.groupName) room.name = String(message.groupName);
    room.lines.push(line);
    while (room.lines.length > limit) room.lines.shift();
    rooms.set(message.key, room);
  }

  function recent(key) {
    return [...(rooms.get(key)?.lines || [])];
  }

  function name(key) {
    return rooms.get(key)?.name || '';
  }

  return { observe, recent, name };
}
