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

  function request({ what, why, key = '' } = {}) {
    const text = String(what ?? '').trim().slice(0, 120);
    if (!text) return null;
    let id = crypto.randomUUID().replace(/-/g, '').slice(0, 4).toUpperCase();
    while (list.some((x) => x.id === id)) id = crypto.randomUUID().replace(/-/g, '').slice(0, 4).toUpperCase();
    const item = {
      id, what: text, why: String(why ?? '').trim().slice(0, 240), key,
      status: 'pending', at: Date.now(), decidedAt: 0, expiresAt: 0
    };
    list.push(item);
    list = list.slice(-50);
    persist();
    logger?.info('permission.requested', { id, what: text, key });
    return item;
  }

  function pending() {
    return list.filter((x) => x.status === 'pending').slice(-10);
  }

  function decide(id, ok) {
    let item = id ? list.find((x) => x.id === String(id).toUpperCase() && x.status === 'pending') : null;
    if (!item) item = pending().slice(-1)[0] || null;
    if (!item) return null;
    item.status = ok ? 'granted' : 'denied';
    item.decidedAt = Date.now();
    item.expiresAt = ok ? Date.now() + ttlMs : 0;
    persist();
    logger?.info('permission.decided', { id: item.id, ok, what: item.what });
    return item;
  }

  function active() {
    const now = Date.now();
    return list.filter((x) => x.status === 'granted' && Number(x.expiresAt) > now);
  }

  function activeText() {
    const items = active();
    if (!items.length) return '';
    return `主人刚刚允许：${items.map((x) => x.what).join('、')}。在有效期内可以做，但不要越过硬底线。`;
  }

  return { request, pending, decide, active, activeText };
}
