import { durationWord } from './time.js';

export function createDaydream({
  mind,
  textRouter,
  storyStore = null,
  character = null,
  logger = null
}) {
  async function recentMemory() {
    if (!storyStore) return '';
    try {
      const keys = storyStore.listChats();
      if (!keys.length) return '';
      const key = keys[0].replace('_', ':');
      const story = storyStore.read(key, character?.card ?? null);
      return (story.episodes || []).slice(-2).map((item) => item.text).filter(Boolean).join('\n\n');
    } catch {
      return '';
    }
  }

  async function run() {
    const state = mind.read();
    const lastContact = Number(state.presence?.lastContactAt) || 0;
    const elapsed = lastContact ? Date.now() - lastContact : NaN;
    const when = durationWord(elapsed);
    const memory = await recentMemory();
    const answer = await textRouter.generate({
      system: [
        `你是${character?.card?.name || '她'}。`,
        '',
        '现在没有人说话。',
        when + '。',
        state.presence?.pendingWake ? `你刚从一段黑暗里醒来：${state.presence.pendingWake.word}。` : '',
        '你在这里。',
        '',
        state.now ? `你这边：\n${state.now}` : '',
        state.unfinished ? `没想完的：\n${state.unfinished}` : '',
        state.self ? `你一直带着的问题：\n${state.self.split('\n').slice(-6).join('\n')}` : '',
        state.worldview ? `你见过的：\n${state.worldview}` : '',
        memory ? `你还记得：\n${memory}` : '',
        state.undercurrent ? `你上一次的暗流：\n${state.undercurrent.split('\n').slice(-8).join('\n')}` : '',
        '',
        '你可以继续想，也可以什么都不做。'
      ].filter(Boolean).join('\n'),
      user: ''
    });
    const text = String(answer?.text ?? '').trim();
    if (text) mind.appendUndercurrent(text);
    mind.touchThought();
    logger?.info('mind.daydream', { chars: text.length });
    return { text, state: mind.read() };
  }

  let timer = null;
  function start({ intervalMs = 2 * 60 * 60 * 1000, idleMs = 2 * 60 * 60 * 1000 } = {}) {
    if (timer) return;
    timer = setInterval(async () => {
      try {
        const state = mind.read();
        const last = Number(state.presence?.lastContactAt || state.presence?.createdAt) || 0;
        if (!last || Date.now() - last < idleMs) return;
        await run();
      } catch (error) {
        logger?.warn('mind.daydream_failed', { error: String(error?.message ?? error) });
      }
    }, intervalMs);
    timer.unref?.();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { run, start, stop };
}
