import { durationWord } from './time.js';
import { readGroupHistory } from '../runtime/group-history.js';

export function createDaydream({
  mind,
  textRouter,
  storyStore = null,
  character = null,
  gateway = null,
  config = {},
  liveGroup = null,
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

  function groupName(groupId) {
    const key = `group:${groupId}`;
    return liveGroup?.name(key) || '一个群';
  }

  async function candidates() {
    const out = [];
    const owner = String(config?.autonomy?.owner || config?.allow?.private?.[0] || '').trim();
    if (owner) out.push({ label: '他', kind: 'private', id: owner });
    for (const groupId of config?.allow?.groups || []) {
      let label = liveGroup?.name(`group:${groupId}`) || '';
      if (!label) {
        try { label = (await readGroupHistory({ gateway, groupId })).groupName || ''; } catch {}
      }
      out.push({ label: label || '一个群', kind: 'group', id: String(groupId) });
    }
    return out;
  }

  async function run() {
    const state = mind.read();
    const lastContact = Number(state.presence?.lastContactAt) || 0;
    const elapsed = lastContact ? Date.now() - lastContact : NaN;
    const when = durationWord(elapsed);
    const memory = await recentMemory();
    const canReach = Boolean(mind.canReach?.()) && gateway?.ws?.readyState === 1;
    const places = await candidates();
    const reachTool = canReach && places.length ? {
      type: 'function',
      function: {
        name: 'reach_out',
        description: '如果真的想找某个人或某个群说话，就用这个。大多数时候不要用。',
        parameters: {
          type: 'object',
          properties: {
            conversation: { type: 'string', description: '要发去哪里，用下面列出的名字' },
            text: { type: 'string', description: '你想说的话' }
          },
          required: ['conversation', 'text']
        }
      }
    } : null;

    const system = [
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
      '你可以继续想，也可以什么都不做。',
      reachTool ? '你现在可以找：' : '',
      ...places.map((place) => `- ${place.label}（${place.kind === 'private' ? '私聊' : '群聊'}）`),
      reachTool ? '如果真的有话说，就用 reach_out；没有就留空。' : ''
    ].filter(Boolean).join('\n');

    async function execute(name, args = {}) {
      if (name !== 'reach_out') return '没有这个动作。';
      const place = places.find((item) => item.label === String(args.conversation ?? '').trim());
      const text = String(args.text ?? '').trim();
      if (!place) return '没有这个地方。';
      if (!text) return '没说话。';
      await gateway.sendText(place.kind, place.id, text);
      mind.noteReach();
      logger?.info('mind.reached_out', { kind: place.kind, label: place.label, chars: text.length });
      return '发出去了。';
    }

    const request = { system, user: '' };
    const answer = reachTool && textRouter.generateWithTools
      ? await textRouter.generateWithTools({ ...request, tools: [reachTool], execute })
      : await textRouter.generate(request);
    const text = String(answer?.text ?? '').trim();
    if (text) mind.appendUndercurrent(text);
    mind.touchThought();
    logger?.info('mind.daydream', { chars: text.length, reach: Boolean(reachTool) });
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
