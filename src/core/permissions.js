import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function createPermissions({ file = 'state/permissions.json', ttlMs = 30 * 60 * 1000, logger = null } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let list = [];
  try { list = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { list = []; }
  if (!Array.isArray(list)) list = [];

  function persist() {
    try { fs.writeFileSync(file, JSON.stringify(list, null, 2) + '\n', 'utf8'); }
    catch (error) { logger?.warn('permissions.write_failed', { error: String(error?.message ?? error) }); }
  }

  function keysOf(item) {
    if (Array.isArray(item?.keys)) return item.keys.map(String).filter(Boolean);
    return item?.key ? [String(item.key)] : [];
  }

  function inScope(item, key) {
    if (!key) return true;
    const keys = keysOf(item);
    return !keys.length || keys.includes(key);
  }

  function request({ what, why, key = '', keys = [] } = {}) {
    const text = String(what ?? '').trim().slice(0, 120);
    if (!text) return null;
    let id = crypto.randomUUID().replace(/-/g, '').slice(0, 4).toUpperCase();
    while (list.some((x) => x.id === id)) id = crypto.randomUUID().replace(/-/g, '').slice(0, 4).toUpperCase();
    const allKeys = [...new Set([...(Array.isArray(keys) ? keys : []), key].map(String).filter(Boolean))];
    const item = {
      id, what: text, why: String(why ?? '').trim().slice(0, 240),
      keys: allKeys, key: allKeys[0] || '',
      status: 'pending', at: Date.now(), decidedAt: 0, expiresAt: 0, deniedBy: []
    };
    list.push(item);
    list = list.slice(-50);
    persist();
    logger?.info('permission.requested', { id, what: text, keys: allKeys });
    return item;
  }

  function pending(key = '') {
    return list.filter((x) => x.status === 'pending' && inScope(x, key)).slice(-10);
  }

  function candidates(key = '') {
    const now = Date.now();
    return list
      .filter((x) => inScope(x, key) && (x.status === 'pending' || (x.status === 'granted' && Number(x.expiresAt) > now)))
      .slice(-10);
  }

  function decide(id, ok, key = '') {
    const scoped = list.filter((x) => inScope(x, key) && ['pending', 'granted'].includes(x.status));
    let item = id ? scoped.find((x) => x.id === String(id).toUpperCase()) : null;
    if (!item) item = scoped.slice(-1)[0] || null;
    if (!item) return null;

    if (item.status === 'granted') {
      if (ok) return item;
      item.status = 'revoked';
      item.decidedAt = Date.now();
      item.expiresAt = 0;
      persist();
      logger?.info('permission.revoked', { id: item.id, key, what: item.what });
      return item;
    }

    if (ok) {
      item.status = 'granted';
      item.approvedBy = key;
      item.decidedAt = Date.now();
      item.expiresAt = Date.now() + ttlMs;
    } else {
      item.deniedBy = [...new Set([...(item.deniedBy || []), key].filter(Boolean))];
      const allKeys = keysOf(item);
      item.status = allKeys.length && allKeys.every((k) => item.deniedBy.includes(k)) ? 'denied' : 'pending';
      item.decidedAt = Date.now();
    }
    persist();
    logger?.info('permission.decided', { id: item.id, ok, key, status: item.status, what: item.what });
    return item;
  }

  function active(key = '') {
    const now = Date.now();
    return list.filter((x) => x.status === 'granted' && Number(x.expiresAt) > now && inScope(x, key));
  }

  function activeText(key = '') {
    const items = active(key);
    if (!items.length) return '';
    const who = items.every((x) => String(x.approvedBy || '').startsWith('group:')) ? '群里' : '主人';
    return `${who}刚刚同意：${items.map((x) => x.what).join('、')}。在有效期内可以做，但不要越过硬底线。`;
  }

  return { request, pending, candidates, decide, active, activeText };
}
