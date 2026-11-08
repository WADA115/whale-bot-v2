import fs from 'node:fs';
import path from 'node:path';

export function createContacts({ file = 'state/contacts.json', logger = null } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let data = {};
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { data = {}; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};

  function persist() {
    try { fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8'); }
    catch (error) { logger?.warn('contacts.write_failed', { error: String(error?.message ?? error) }); }
  }

  function remember({ id = '', name = '', key = '', text = '' } = {}) {
    const uid = String(id || '').trim();
    if (!uid) return;
    const old = data[uid] || { name: '', keys: [], notes: [], at: 0 };
    const next = {
      name: String(name || old.name || '').slice(0, 32),
      keys: [...new Set([...(old.keys || []), String(key || '')].filter(Boolean))].slice(-8),
      notes: [...(old.notes || []), String(text || '').replace(/\s+/g, ' ').trim().slice(0, 120)].filter(Boolean).slice(-3),
      at: Date.now()
    };
    data[uid] = next;
    persist();
  }

  function describe(id = '') {
    const c = data[String(id || '')];
    if (!c) return '';
    const parts = [];
    if (c.name) parts.push(`昵称：${c.name}`);
    if (c.notes?.length) parts.push(`之前聊过：${c.notes.join(' / ')}`);
    return parts.join('；').slice(0, 300);
  }

  return { remember, describe, data };
}
