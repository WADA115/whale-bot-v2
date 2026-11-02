import { stripThink } from './router.js';

export function buildPrompt(batch, config, extras = {}) {
  const role = config.role?.name || '小鲸鱼';
  const aliases = [role, ...(config.role?.aliases ?? [])].filter(Boolean).join('、');
  const lines = batch.map((message) => {
    const from = message.senderName || message.userId || '群友';
    return `${from}：${message.text || '[图片]'}`;
  });
  const system = [
    ...(extras.roleText ? [String(extras.roleText).slice(0, 4000)] : []),
    `你是「${role}」，群友可能叫你：${aliases}。`,
    '你在 QQ 群里聊天。只输出要发的那一句回复，不要解释，不要 Markdown，不要输出思考过程。',
    '默认只发一条，最多一条；控制在 60 字以内；不刷屏，不连续追问，不复述旧故障。',
    '如果没什么值得回的就只回复一个「嗯」或直接输出空字符串。'
  ].join('\n');
  const context = [
    ...(extras.memoryLines ?? []),
    ...(extras.knowledgeLines ?? []),
    ...(extras.imageDesc ? ['[当前图片] ' + extras.imageDesc] : [])
  ].filter(Boolean);
  return {
    system,
    user: [
      context.length ? '背景：\n' + context.join('\n') : '',
      `最近的群聊/私聊消息：\n${lines.join('\n')}`,
      '请只回复最后一条。'
    ].filter(Boolean).join('\n\n')
  };
}

export function sanitizeReply(raw, maxChars = 160) {
  let text = stripThink(raw);
  text = text.replace(/```[\s\S]*?```/g, ' ');
  text = text.replace(/^\s*(?:回复|回答|输出)[:：]\s*/i, '');
  text = text.replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length > maxChars) text = text.slice(0, maxChars).replace(/[，,、；;：:]\s*$/, '');
  return text;
}

export function shadowReply(batch) {
  const last = batch[batch.length - 1];
  const count = batch.length;
  return `[shadow] ${count} 条消息，最后一条：${String(last?.text ?? '').slice(0, 80)}`;
}
