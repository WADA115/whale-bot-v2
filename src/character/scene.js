import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteJson } from '../runtime/atomic.js';

function blank(key) {
  return {
    key,
    where: '私聊',
    present: [],
    recent: '',
    mood: '平静',
    openLoops: [],
    intent: '回应最后一句',
    turns: [],
    updatedAt: Date.now()
  };
}

export function createSceneStore({ file, maxTurns = 8, logger = null } = {}) {
  let data = {};
  try {
    if (file && fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (parsed && typeof parsed === 'object') data = parsed;
    }
  } catch (error) {
    logger?.warn('scene.load_failed', { error: String(error?.message ?? error) });
  }

  function save() {
    if (!file) return;
    try {
      atomicWriteJson(file, data);
    } catch (error) {
      logger?.warn('scene.save_failed', { error: String(error?.message ?? error) });
    }
  }

  function get(key) {
    if (!data[key]) data[key] = blank(key);
    return data[key];
  }

  function update(key, patch = {}) {
    const scene = get(key);
    const next = { ...scene, ...patch, updatedAt: Date.now() };
    if (Array.isArray(patch.turns)) next.turns = patch.turns.slice(-maxTurns);
    else next.turns = scene.turns.slice(-maxTurns);
    data[key] = next;
    save();
    return next;
  }

  function pushTurn(key, role, text) {
    const scene = get(key);
    const turns = [...scene.turns, { role, text: String(text ?? '').slice(0, 500), at: Date.now() }].slice(-maxTurns);
    return update(key, { turns, recent: String(text ?? '').slice(0, 120) });
  }

  function clear(key = '') {
    if (key) delete data[key];
    else data = {};
    save();
  }

  return { get, update, pushTurn, save, clear, snapshot: () => JSON.parse(JSON.stringify(data)) };
}
