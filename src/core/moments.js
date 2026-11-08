import fs from 'node:fs';
import path from 'node:path';

export function createMoments({ file = 'state/moments.json', limit = 30, logger = null } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let list = [];
  try { list = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { list = []; }
  if (!Array.isArray(list)) list = [];

  function persist() {
    try { fs.writeFileSync(file, JSON.stringify(list, null, 2) + '\n', 'utf8'); }
    catch (error) { logger?.warn('moments.write_failed', { error: String(error?.message ?? error) }); }
  }

  function add({ what = '', audience = '', key = '' } = {}) {
    const text = String(what || '').trim().slice(0, 240);
    if (!text) return null;
    const item = { what: text, audience: String(audience || '').slice(0, 40), key: String(key || ''), at: Date.now() };
    list.push(item);
    list = list.slice(-limit);
    persist();
    return item;
  }

  function recent(n = 4) {
    return list.slice(-n);
  }

  function text(n = 4) {
    const items = recent(n);
    if (!items.length) return '';
    return items.map((x) => `${x.audience ? `[${x.audience}] ` : ''}${x.what}`).join('\n');
  }

  return { add, recent, text, list };
}
