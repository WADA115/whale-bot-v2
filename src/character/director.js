export function createDirector({ sceneStore, privateOnly = true, groupTrigger = 'mention', aliases = [], logger = null } = {}) {
  function mentioned(message) {
    if ((message.at || []).includes(String(message.selfId || ''))) return true;
    const text = String(message.text || '');
    return aliases.some((alias) => alias && text.includes(alias));
  }

  function observe(message) {
    if (!message?.key) return { respond: false, reason: 'bad-message' };
    if (privateOnly && message.kind !== 'private') {
      logger?.debug?.('director.group_frozen', { key: message.key });
      return { respond: false, reason: 'group-frozen' };
    }
    if (message.kind === 'private') {
      const scene = sceneStore.update(message.key, {
        where: '私聊',
        present: ['对方'],
        mood: '平静',
        intent: '回应最后一句'
      });
      sceneStore.pushTurn(message.key, 'user', message.text || '[非文字消息]');
      return { respond: true, reason: 'private', scene: sceneStore.get(message.key) };
    }
    if (message.kind === 'group') {
      if (groupTrigger === 'mention' && !mentioned(message)) {
        return { respond: false, reason: 'group-not-mentioned' };
      }
      const scene = sceneStore.update(message.key, {
        where: '群聊',
        present: [message.senderName || '群友'],
        intent: '接一句，别刷屏'
      });
      sceneStore.pushTurn(message.key, 'user', message.text || '[非文字消息]');
      return { respond: true, reason: 'group', scene: sceneStore.get(message.key) };
    }
    return { respond: false, reason: 'not-private' };
  }

  function recordReply(key, text) {
    sceneStore.pushTurn(key, 'assistant', text);
    sceneStore.update(key, { recent: String(text ?? '').slice(0, 120) });
  }

  function sceneCard(key) {
    const scene = sceneStore.get(key);
    const present = (scene.present ?? []).join('、') || '对方';
    const loops = (scene.openLoops ?? []).join('；') || '无';
    return [
      `地点：${scene.where}`,
      `在场：${present}`,
      `刚才：${scene.recent || '刚开始聊'}`,
      `心情：${scene.mood}`,
      `未完成：${loops}`,
      `意图：${scene.intent}`
    ].join('\n');
  }

  return { observe, recordReply, sceneCard };
}
