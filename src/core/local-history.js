import fs from 'node:fs';
import path from 'node:path';

export function createLocalHistory({ file = 'state/local-history.json', limit = 200, logger = null } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let list = [];
  try { list = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { list = []; }
  if (!Array.isArray(list)) list = [];

  function persist() {
    try { fs.writeFileSync(file, JSON.stringify(list, null, 2) + '\n', 'utf8'); }
    catch (error) { logger?.warn('local_history.write_failed', { error: String(error?.message ?? error) }); }
  }

  function add({ role = 'user', text = '', segments = [] } = {}) {
    const item = {
      role: role === 'assistant' ? 'assistant' : 'user',
      text: String(text ?? '').slice(0, 4000),
      segments: (Array.isArray(segments) ? segments : []).slice(0, 6).map((seg) => ({
        kind: String(seg?.kind || ''),
        url: String(seg?.url || '')
      })).filter((seg) => seg.kind && seg.url),
      at: Date.now()
    };
    if (!item.text && !item.segments.length) return null;
    list.push(item);
    list = list.slice(-limit);
    persist();
    return item;
  }

  function recent(n = 60) {
    return list.slice(-n);
  }

  function clear() {
    list = [];
    persist();
  }

  return { add, recent, list: () => list, clear };
}
