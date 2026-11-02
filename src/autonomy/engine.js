import fs from 'node:fs';
import path from 'node:path';

function dayKey() {
  return new Date().toISOString().slice(0, 10);
}

const BANNED_TYPE = /动画|番剧|电影|纪录片|电视剧|综艺|影视|国创|少儿|预告|短片|娱乐|人文历史/;
const COMMENTARY = /解说|吐槽|评论|盘点|影评|分析|科普|杂谈|讲解/;
const BANNED_WORD = /明星|艺人|偶像|饭圈|八卦|娱乐|绯闻|塌房|恋情|官宣|短剧|漫剧|电影|动画|纪录片|预告/;

export function blockedItem(item, { allowCommentary = true } = {}) {
  const title = String(item?.title ?? '');
  const tname = String(item?.tname ?? '');
  const tags = String(item?.tags ?? '');
  const commentary = allowCommentary && COMMENTARY.test(title);
  if (BANNED_WORD.test(title) && !commentary) return true;
  if (BANNED_WORD.test(tags) && !commentary) return true;
  if (BANNED_TYPE.test(tname) && !commentary) return true;
  if (BANNED_TYPE.test(title) && !commentary) return true;
  if (title.length < 4) return true;
  return false;
}

export function createAutonomy({ config, bili, gateway, logger = null, stateFile }) {
  let state = { day: dayKey(), count: 0, seen: {}, discoveries: [], lastSentAt: 0 };
  const lastActivity = new Map();
  try {
    if (stateFile && fs.existsSync(stateFile)) {
      const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      if (parsed && typeof parsed === 'object') state = { ...state, ...parsed };
    }
  } catch (error) {
    logger?.warn('autonomy.load_failed', { error: String(error?.message ?? error) });
  }

  function save() {
    if (!stateFile) return;
    try {
      fs.mkdirSync(path.dirname(stateFile), { recursive: true });
      fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8');
    } catch (error) {
      logger?.warn('autonomy.save_failed', { error: String(error?.message ?? error) });
    }
  }

  function touch(key, at = Date.now()) {
    lastActivity.set(key, at);
  }

  function quiet() {
    const hour = new Date().getHours();
    return hour >= Number(config.quietStart ?? 0) && hour < Number(config.quietEnd ?? 8);
  }

  async function collect() {
    if (!config.enabled) return [];
    const found = [];
    if (config.sources?.bilibili === true && bili?.popular) {
      try {
        const list = await bili.popular(Number(config.maxItems) || 5);
        for (const item of list) {
          if (blockedItem(item, config)) continue;
          found.push({
            id: `bili:${item.bvid}`,
            source: 'bilibili',
            title: item.title,
            url: `https://www.bilibili.com/video/${item.bvid}`,
            owner: item.owner
          });
        }
      } catch (error) {
        logger?.warn('autonomy.bilibili_failed', { error: String(error?.message ?? error) });
      }
    }
    if (config.sources?.bilibiliSearch !== false && bili?.search) {
      const keywords = Array.isArray(config.keywords) ? config.keywords : [];
      for (const keyword of keywords.slice(0, 8)) {
        try {
          const list = await bili.search(keyword, 2);
          for (const item of list) {
            if (blockedItem(item, config)) continue;
            found.push({
              id: `bili:${item.bvid}`,
              source: 'bilibili-search',
              title: item.title,
              url: `https://www.bilibili.com/video/${item.bvid}`,
              owner: item.owner,
              keyword
            });
          }
        } catch (error) {
          logger?.warn('autonomy.search_failed', { keyword, error: String(error?.message ?? error) });
        }
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
    }
    if (config.sources?.qzone === true) {
      try {
        const result = await gateway.getQzoneFeeds({ count: Number(config.maxItems) || 5 });
        const feeds = result?.feeds ?? result?.data?.feeds ?? [];
        for (const item of feeds) {
          const content = String(item.content ?? '').slice(0, 120);
          if (blockedItem({ title: content }, config)) continue;
          found.push({
            id: `qzone:${item.tid}`,
            source: 'qzone',
            title: content,
            url: '',
            owner: item.nickname
          });
        }
      } catch (error) {
        logger?.warn('autonomy.qzone_failed', { error: String(error?.message ?? error) });
      }
    }
    const fresh = found.filter((x) => x.id && !state.seen[x.id]);
    for (const item of fresh) state.seen[item.id] = Date.now();
    if (fresh.length) {
      state.discoveries = [...fresh, ...state.discoveries].slice(0, 30);
      save();
      logger?.info('autonomy.discovered', { count: fresh.length });
    }
    return fresh;
  }

  function canNotify(owner, now) {
    if (!config.notifyOwner) return false;
    if (!owner) return false;
    if (quiet()) return false;
    if (state.day !== dayKey()) {
      state = { ...state, day: dayKey(), count: 0 };
    }
    if (state.count >= Number(config.maxPerDay || 1)) return false;
    if (now - Number(state.lastSentAt || 0) < Number(config.minGapMinutes || 360) * 60_000) return false;
    const last = Number(lastActivity.get(`private:${owner}`) || 0);
    return now - last >= Number(config.minIdleMinutes || 360) * 60_000;
  }

  async function tick() {
    if (!config.enabled) return [];
    const fresh = await collect();
    if (!fresh.length) return [];
    const owner = String(config.owner || '').trim();
    const now = Date.now();
    if (!canNotify(owner, now)) return [];
    const item = fresh[0];
    const text = `刷到一个：${item.title}${item.url ? `\n${item.url}` : ''}`;
    try {
      await gateway.sendText('private', owner, text);
      state.count += 1;
      state.lastSentAt = now;
      save();
      logger?.info('autonomy.notified', { id: item.id, owner });
    } catch (error) {
      logger?.warn('autonomy.notify_failed', { error: String(error?.message ?? error) });
    }
    return fresh;
  }

  function start() {
    const owner = String(config.owner || '').trim();
    if (owner) touch(`private:${owner}`);
    const timer = setInterval(tick, Number(config.intervalMs || 1_800_000));
    timer.unref?.();
    return () => clearInterval(timer);
  }

  function status() {
    return {
      enabled: Boolean(config.enabled),
      notifyOwner: Boolean(config.notifyOwner),
      discoveries: state.discoveries.slice(0, 10),
      countToday: state.count,
      lastSentAt: state.lastSentAt
    };
  }

  return { start, tick, touch, collect, status };
}
