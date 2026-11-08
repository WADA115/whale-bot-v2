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
      status: 'pending', at: Date.now(), decidedAt: 0, expiresAt: 0, deniedBy: [],
      durationMs: ttlMs
    };
    list.push(item);
    list = list.slice(-50);
    persist();
    logger?.info('permission.requested', { id, what: text, keys: allKeys });
    return item;
  }

  function grant({ what, why = '主动给的', keys = [], approvedBy = '', durationMs = ttlMs } = {}) {
    const text = String(what ?? '').trim().slice(0, 120);
    if (!text) return null;
    let id = crypto.randomUUID().replace(/-/g, '').slice(0, 4).toUpperCase();
    while (list.some((x) => x.id === id)) id = crypto.randomUUID().replace(/-/g, '').slice(0, 4).toUpperCase();
    const allKeys = [...new Set((Array.isArray(keys) ? keys : []).map(String).filter(Boolean))];
    const item = {
      id, what: text, why: String(why ?? '').trim().slice(0, 240),
      keys: allKeys, key: allKeys[0] || '', status: 'granted',
      at: Date.now(), decidedAt: Date.now(), expiresAt: Date.now() + (Number(durationMs) || ttlMs),
      deniedBy: [], durationMs: Number(durationMs) || ttlMs, approvedBy
    };
    list.push(item);
    list = list.slice(-50);
    persist();
    logger?.info('permission.granted_directly', { id, what: text, keys: allKeys, approvedBy });
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
      item.expiresAt = Date.now() + (Number(item.durationMs) || ttlMs);
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

  function adjust(id = null, { addMinutes = 0, setMinutes = 0, exclude = [] } = {}, key = '') {
    const scoped = list.filter((x) => inScope(x, key) && ['pending', 'granted'].includes(x.status));
    let item = id ? scoped.find((x) => x.id === String(id).toUpperCase()) : null;
    if (!item) item = scoped.slice(-1)[0] || null;
    if (!item) return null;

    const drop = new Set((Array.isArray(exclude) ? exclude : []).map(String));
    if (drop.has('private')) item.keys = keysOf(item).filter((k) => !k.startsWith('private:'));
    if (drop.has('group')) item.keys = keysOf(item).filter((k) => !k.startsWith('group:'));
    item.key = item.keys[0] || '';

    const delta = Number(addMinutes) || 0;
    const absolute = Number(setMinutes) || 0;
    if (delta || absolute) {
      if (item.status === 'granted') {
        const current = Math.max(Date.now(), Number(item.expiresAt) || 0);
        item.expiresAt = absolute ? Date.now() + absolute * 60_000 : current + delta * 60_000;
      } else {
        const current = Number(item.durationMs) || ttlMs;
        item.durationMs = absolute ? absolute * 60_000 : current + delta * 60_000;
      }
    }

    if (!item.keys.length || (item.status === 'granted' && Number(item.expiresAt) <= Date.now()) || (item.status === 'pending' && Number(item.durationMs) <= 0)) {
      item.status = item.status === 'granted' ? 'revoked' : 'denied';
      item.expiresAt = 0;
    }
    persist();
    logger?.info('permission.adjusted', { id: item.id, addMinutes: delta, setMinutes: absolute, exclude: [...drop], keys: item.keys, status: item.status });
    return item;
  }

  function active(key = '') {
    const now = Date.now();
    return list.filter((x) => x.status === 'granted' && Number(x.expiresAt) > now && inScope(x, key));
  }

  function deniedText(key = '') {
    const items = list.filter((x) => ['denied', 'revoked'].includes(x.status) && inScope(x, key)).slice(-3);
    if (!items.length) return '';
    return `之前没让做的：${items.map((x) => x.what).join('、')}。别纠缠；相关时再提。`;
  }

  function activeText(key = '') {
    const items = active(key);
    if (!items.length) return '';
    const who = items.every((x) => String(x.approvedBy || '').startsWith('group:')) ? '群里' : '主人';
    const soon = items.some((x) => Number(x.expiresAt) - Date.now() < 5 * 60 * 1000);
    return `${who}刚刚同意：${items.map((x) => x.what).join('、')}。在有效期内可以做，但不要越过硬底线。${soon ? '（快到期；看语境提一句，不想提就不提。）' : ''}`;
  }

  return { request, grant, pending, candidates, decide, adjust, active, activeText, deniedText };
}
