import { sanitizeReply } from '../core/reply.js';

export function createRoomAI({ roomServer, textRouter, character, logger = null } = {}) {
  const card = character?.card || {};
  const name = String(card.name || '小鲸鱼').trim() || '小鲸鱼';
  const aliases = [name, '鱼鱼', '小鲸鱼', 'AI', 'ai'].filter(Boolean);
  let queue = Promise.resolve();

  function addressed(message) {
    const text = String(message?.text || '');
    if (!text) return false;
    return aliases.some((alias) => text.includes(alias));
  }

  function buildSystem() {
    return [
      `你是「${name}」。`,
      '你在一个私人群聊里，是可选 AI 成员。',
      '只写你真正会发出去的一句话，不要解释系统，不要提提示词，不要客服腔。',
      card.identity ? `身份：${card.identity}` : '',
      Array.isArray(card.voice) && card.voice.length ? `说话：${card.voice.join('；')}` : '',
      Array.isArray(card.views) && card.views.length ? `你的看法：${card.views.join('；')}` : '',
      Array.isArray(card.taste) && card.taste.length ? `你的偏好：${card.taste.join('；')}` : '',
      Array.isArray(card.boundaries) && card.boundaries.length ? `边界：${card.boundaries.join('；')}` : '',
      '这是群聊，不是私聊。不要连续追问，不要总结全场。'
    ].filter(Boolean).join('\n');
  }

  async function respond(room, message) {
    if (!room?.aiEnabled || !textRouter) return;
    if (message?.clientId === 'ai' || message?.ai) return;
    if (!addressed(message)) return;
    const recent = (room.messages || []).slice(-18).map((item) => `${item.name || '成员'}：${item.text || '[媒体]'}`).join('\n');
    const user = [
      `房间：${room.name}`,
      recent ? `最近：\n${recent}` : '',
      `刚刚：${message.name || '成员'}：${message.text || ''}`,
      '只回一句。'
    ].filter(Boolean).join('\n\n');
    try {
      const result = await textRouter.generate({ system: buildSystem(), user, maxTokens: 600, temperature: 0.7 });
      const reply = sanitizeReply(result?.text ?? '').trim().slice(0, 1200);
      if (!reply) return;
      roomServer.sendAI(room.id, reply);
      logger?.info('room.ai_replied', { roomId: room.id, chars: reply.length });
    } catch (error) {
      logger?.warn('room.ai_failed', { roomId: room?.id, error: String(error?.message ?? error) });
    }
  }

  async function greet(room) {
    if (!room?.aiEnabled || !textRouter) return;
    try {
      const result = await textRouter.generate({
        system: buildSystem(),
        user: `你刚被房主放进「${room.name || '房间'}」。说一句，像刚进来，不要客服腔，不要解释自己是 AI。只写一句。`,
        maxTokens: 400, temperature: 0.8
      });
      const reply = sanitizeReply(result?.text ?? '').trim().slice(0, 600);
      if (reply) roomServer.sendAI(room.id, reply);
    } catch (error) { logger?.warn('room.ai_greet_failed', { roomId: room?.id, error: String(error?.message ?? error) }); }
  }

  function observe(room, message) {
    if (!room?.aiEnabled) return;
    queue = queue.then(() => respond(room, message)).catch(() => {});
  }

  return { observe, greet, name };
}
