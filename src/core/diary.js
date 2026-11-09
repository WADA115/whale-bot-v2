import fs from 'node:fs';
import path from 'node:path';

export function createDiary({ file = 'state/diary.json', limit = 80, logger = null } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let list = [];
  try { list = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { list = []; }
  if (!Array.isArray(list)) list = [];

  function persist() {
    try { fs.writeFileSync(file, JSON.stringify(list, null, 2) + '\n', 'utf8'); }
    catch (error) { logger?.warn('diary.write_failed', { error: String(error?.message ?? error) }); }
  }

  function add({ text = '', at = Date.now() } = {}) {
    const body = String(text ?? '').trim().slice(0, 800);
    if (!body) return null;
    const item = { text: body, at: Number(at) || Date.now() };
    list.push(item);
    list = list.slice(-limit);
    persist();
    return item;
  }

  function recent(n = 5) {
    return list.slice(-n);
  }

  function remove(at) {
    const target = Number(at) || 0;
    const before = list.length;
    list = list.filter((x) => Number(x.at) !== target);
    persist();
    return list.length !== before;
  }

  return { add, recent, list, remove, persist, data: list };
}
