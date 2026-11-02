export function isAllowed({ kind, id, allow }) {
  const list = kind === 'group' ? allow?.groups : allow?.private;
  if (!Array.isArray(list) || list.length === 0) return false;
  return list.map(String).includes(String(id));
}

export function isAddressed({ message, role, selfId }) {
  if (message.kind === 'private') return true;
  const aliases = [role?.name, ...(role?.aliases ?? [])].map(String).filter(Boolean);
  if (message.at.map(String).includes(String(selfId))) return true;
  return aliases.some((name) => message.text.includes(name));
}

export function decide({ message, config, selfId }) {
  if (!message?.kind || !message?.id) return { handle: false, reason: 'bad-message' };
  if (message.userId && message.userId === message.selfId) return { handle: false, reason: 'self' };
  if (!isAllowed({ kind: message.kind, id: message.id, allow: config.allow })) {
    return { handle: false, reason: 'not-allowed' };
  }
  if (message.kind === 'private') return { handle: true, reason: 'private' };
  const otherBots = (config.role?.otherBots ?? []).map(String);
  if (message.senderName && otherBots.includes(String(message.senderName))) {
    return { handle: false, reason: 'other-bot' };
  }
  if (config.role?.groupTrigger === 'all') return { handle: true, reason: 'group-all' };
  if (!message.text && !(message.images?.length)) return { handle: false, reason: 'empty' };
  if (!isAddressed({ message, role: config.role, selfId })) return { handle: false, reason: 'not-addressed' };
  return { handle: true, reason: message.images?.length ? 'addressed-image' : 'addressed' };
}
