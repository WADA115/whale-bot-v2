import fs from 'node:fs';
import path from 'node:path';
import { buildNarrativePrompt } from './prompt.js';

function dayKey() {
  return new Date().toISOString().slice(0, 10);
}

function pendingPlan(now) {
  const text = String(now ?? '');
  const section = text.match(/# 打算\s*([\s\S]*)/)?.[1]?.trim() || '';
  if (!section) return '';
  if (/(先不|不追|收着|算了|不提)/.test(section)) return '';
  return /(等会儿|过一会儿|晚点|再问|想问|主动|找个机会|等他)/.test(section) ? section : '';
}

export function createStoryAgency({ store, gateway, textRouter, card, getScene, logger = null, config = {}, stateFile }) {
  let state = { day: dayKey(), count: 0, sent: {}, lastSentAt: 0 };
  const activity = new Map();
  try {
    if (stateFile && fs.existsSync(stateFile)) {
      const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      if (parsed && typeof parsed === 'object') state = { ...state, ...parsed };
    }
  } catch (error) {
    logger?.warn('agency.load_failed', { error: String(error?.message ?? error) });
  }

  function save() {
    if (!stateFile) return;
    try {
      fs.mkdirSync(path.dirname(stateFile), { recursive: true });
      fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8');
    } catch (error) {
      logger?.warn('agency.save_failed', { error: String(error?.message ?? error) });
    }
  }

  function touch(key, at = Date.now()) {
    activity.set(key, at);
  }

  function quiet() {
    const hour = new Date().getHours();
    return hour >= Number(config.quietStart ?? 0) && hour < Number(config.quietEnd ?? 8);
  }

  function canSend(key, now) {
    if (!config.enabled) return false;
    if (quiet()) return false;
    if (state.day !== dayKey()) state = { day: dayKey(), count: 0, sent: {}, lastSentAt: 0 };
    if (state.count >= Number(config.maxPerDay ?? 1)) return false;
    if (now - Number(activity.get(key) || 0) < Number(config.minIdleMinutes ?? 180) * 60_000) return false;
    if (now - Number(state.lastSentAt || 0) < Number(config.minGapMinutes ?? 360) * 60_000) return false;
    return true;
  }

  async function tick() {
    const now = Date.now();
    for (const key of activity.keys()) {
      if (!key.startsWith('private:')) continue;
      if (!canSend(key, now)) continue;
      const story = store.read(key, card);
      const plan = pendingPlan(story.now);
      if (!plan) continue;
      const scene = getScene?.(key) ?? {};
      const prompt = buildNarrativePrompt({
        card,
        story,
        turns: scene.turns ?? [],
        intent: `按此刻的打算主动说一句，不执行任务：${plan}`,
        maxChars: Number(config.maxChars || 2500)
      });
      try {
        const result = await textRouter.generate(prompt);
        const reply = String(result.text ?? '').trim().slice(0, 160);
        if (!reply) continue;
        await gateway.sendText('private', key.slice('private:'.length), reply);
        state.count += 1;
        state.lastSentAt = now;
        state.sent[key] = now;
        save();
        logger?.info('agency.sent', { key, chars: reply.length });
      } catch (error) {
        logger?.warn('agency.failed', { key, error: String(error?.message ?? error) });
      }
    }
  }

  function start() {
    const timer = setInterval(tick, Number(config.intervalMs || 600000));
    timer.unref?.();
    return () => clearInterval(timer);
  }

  return { start, tick, touch, pendingPlan };
}
