function nameOf(message) {
  return String(message?.sender?.card || message?.sender?.nickname || message?.user_id || '群友').slice(0, 24);
}

function textOf(message) {
  if (Array.isArray(message?.message)) {
    const text = message.message
      .filter((segment) => segment?.type === 'text')
      .map((segment) => String(segment?.data?.text ?? ''))
      .join('')
      .trim();
    if (text) return text;
  }
  return String(message?.raw_message ?? '')
    .replace(/\[CQ:[^\]]+\]/g, '')
    .trim();
}

export async function readGroupHistory({ gateway, groupId, limit = 8 } = {}) {
  if (!gateway || !groupId) return { groupName: '', lines: [] };
  const data = await gateway.call('get_group_msg_history', { group_id: groupId, count: limit });
  const messages = Array.isArray(data?.messages) ? data.messages : [];
  return {
    groupName: String(data?.group_name || messages[0]?.group_name || ''),
    lines: messages
      .map((message) => ({ name: nameOf(message), text: textOf(message) }))
      .filter((line) => line.text)
      .map((line) => `${line.name}：${line.text}`)
  };
}
