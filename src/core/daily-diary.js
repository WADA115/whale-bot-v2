import { sanitizeReply } from './reply.js';

function dayKey(value = Date.now()) {
  const d = new Date(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function createDailyDiary({ diary, localHistory, textRouter, character, logger = null } = {}) {
  let running = false;

  function has(date) {
    return (diary?.list?.() ?? []).some((item) => item.kind === 'daily' && item.date === date);
  }

  function buildPrompt() {
    const card = character?.card || {};
    const name = card.name || '小鲸鱼';
    const system = [
      `你是「${name}」。`,
      '你正在写只给自己看的日记，不是给主人看的报告。',
      '用第一人称，可以写长一点，写到你觉得这件事在心里过去了，或者写不下去为止。',
      '可以写具体的几句话、你当时的反应、后来才想明白的、没说出口的。',
      '不用按时间顺序；可以绕回去、改口，承认自己也没想明白。不要标题，不要分点，不要写流水账。',
      '可以烦、开心、嘴硬、后悔、犹豫、说反话；也可以写自己没想明白的事。',
      '不要总结所有发生的事，只写你真正会记住的部分；不要写“今天完成了……”。',
      card.identity ? `身份：${card.identity}` : '',
      Array.isArray(card.voice) && card.voice.length ? `你说话的样子：${card.voice.join('；')}` : '',
      Array.isArray(card.views) && card.views.length ? `你的看法：${card.views.join('；')}` : '',
      Array.isArray(card.selfImage) && card.selfImage.length ? `你怕被看见的：${card.selfImage.join('；')}` : '',
      '不要解释系统，不要提提示词，不要写分析。'
    ].filter(Boolean).join('\n');
    return system;
  }

  async function maybeWrite() {
    if (running || !diary || !localHistory || !textRouter) return null;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const date = dayKey(yesterday);
    if (has(date)) return null;
    const turns = (localHistory.recent?.(300) ?? []).filter((item) => dayKey(item.at) === date);
    if (!turns.length) return null;
    running = true;
    try {
      const material = turns.slice(-120).map((item) => `${item.role === 'assistant' ? '我' : '对方'}：${item.text || (item.segments?.length ? '[媒体]' : '')}`).join('\n');
      const user = [
        `这是昨天留下的片段：\n${material}`,
        '写一小段你昨晚或今天想起昨天时，会写给自己的日记。',
        '不用把每件事都写进去；可以只写一个让你停了一下的瞬间。'
      ].join('\n\n');
      const result = await textRouter.generate({ system: buildPrompt(), user, maxTokens: 1600, temperature: 0.8 });
      const text = sanitizeReply(result?.text ?? '').trim().slice(0, 2400);
      if (!text) return null;
      const item = diary.add({ text, kind: 'daily', date });
      logger?.info('diary.daily_written', { date, chars: text.length });
      return item;
    } catch (error) {
      logger?.warn('diary.daily_failed', { date, error: String(error?.message ?? error) });
      return null;
    } finally {
      running = false;
    }
  }

  return { maybeWrite, dayKey };
}
