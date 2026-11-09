import fs from 'node:fs';
import path from 'node:path';

export function createMilestones({ file = 'state/milestones.json', limit = 120, logger = null } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let list = [];
  try { list = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { list = []; }
  if (!Array.isArray(list)) list = [];

  function persist() {
    try { fs.writeFileSync(file, JSON.stringify(list, null, 2) + '\n', 'utf8'); }
    catch (error) { logger?.warn('milestones.write_failed', { error: String(error?.message ?? error) }); }
  }

  function add({ what = '', who = '', key = '' } = {}) {
    const text = String(what ?? '').trim().slice(0, 300);
    if (!text) return null;
    const item = { what: text, who: String(who || '').slice(0, 40), key: String(key || ''), at: Date.now() };
    list.push(item);
    list = list.slice(-limit);
    persist();
    return item;
  }

  function recent(n = 6) { return list.slice(-n); }
  function remove(at) {
    const before = list.length;
    list = list.filter((x) => Number(x.at) !== Number(at));
    persist();
    return list.length !== before;
  }
  return { add, recent, list: () => list, remove, data: list };
}
