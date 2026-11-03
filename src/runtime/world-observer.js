import { readGroupHistory } from './group-history.js';

function chatKey(dir) {
  const value = String(dir ?? '');
  const index = value.indexOf('_');
  if (index < 0) return '';
  return `${value.slice(0, index)}:${value.slice(index + 1)}`;
}

export function createWorldObserver({
  config = {},
  storyStore,
  liveGroup,
  gateway,
  bilibili,
  textRouter,
  character,
  logger = null
}) {
  const everyMs = Number(config.intervalMs) > 0 ? Number(config.intervalMs) : 45 * 60 * 1000;
  let timer = null;
  let running = false;

  async function groupLines(key, id) {
    const live = liveGroup?.recent(key) || [];
    if (live.length) return live;
    try {
      const { lines } = await readGroupHistory({ gateway, groupId: id });
      return lines;
    } catch {
      return [];
    }
  }

  async function biliLines() {
    if (!bilibili?.status?.().loggedIn) return [];
    const out = [];
    try {
      for (const item of await bilibili.dynamics()) out.push(`${item.author}：${item.title}`);
    } catch {}
    try {
      for (const item of await bilibili.history()) out.push(`${item.author}：${item.title}`);
    } catch {}
    return out;
  }

  async function collect(key) {
    if (key.startsWith('group:')) return groupLines(key, key.slice('group:'.length));
    return biliLines();
  }

  async function tick() {
    if (running || !storyStore || !textRouter) return;
    running = true;
    try {
      for (const dir of storyStore.listChats()) {
        const key = chatKey(dir);
        if (!key) continue;
        const raw = (await collect(key)).map((line) => String(line ?? '').trim()).filter(Boolean);
        if (!raw.length) continue;
        const result = storyStore.appendWorld(key, raw, character?.card ?? null);
        if (!result.added) continue;
        try {
          const name = character?.card?.name || '她';
          const answer = await textRouter.generate({
            system: [
              `你是${name}。`,
              '',
              '你刚看到这些：',
              ...raw.slice(-8),
              '',
              '你现在在做什么？只写一句，不要解释，不要总结。'
            ].join('\n'),
            user: ''
          });
          const life = String(answer?.text ?? '').trim();
          if (life) storyStore.writeSection(key, 'life', life, character?.card ?? null);
        } catch (error) {
          logger?.warn('world.life_failed', { key, error: String(error?.message ?? error) });
        }
      }
    } catch (error) {
      logger?.warn('world.observe_failed', { error: String(error?.message ?? error) });
    } finally {
      running = false;
    }
  }

  function start() {
    if (timer) return;
    const first = setTimeout(() => tick().catch(() => {}), 15000);
    first.unref?.();
    timer = setInterval(() => tick().catch(() => {}), everyMs);
    timer.unref?.();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { start, stop, tick };
}
