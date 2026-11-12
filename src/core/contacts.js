import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteJson } from '../runtime/atomic.js';

function normalizeNotes(notes) {
  return (Array.isArray(notes) ? notes : []).map((n) => {
    if (n && typeof n === 'object' && n.text) return { text: String(n.text).slice(0, 120), key: String(n.key || ''), at: Number(n.at) || 0 };
    return { text: String(n ?? '').slice(0, 120), key: '', at: 0 };
  }).filter((n) => n.text);
}

export function createContacts({ file = 'state/contacts.json', logger = null } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let data = {};
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { data = {}; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};

  function persist() {
    try { atomicWriteJson(file, data); }
    catch (error) { logger?.warn('contacts.write_failed', { error: String(error?.message ?? error) }); }
  }

  function remember({ id = '', name = '', key = '', text = '' } = {}) {
    const uid = String(id || '').trim();
    if (!uid) return;
    const old = data[uid] || { name: '', keys: [], notes: [], at: 0 };
    const notes = normalizeNotes(old.notes);
    const body = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const next = {
      name: String(name || old.name || '').slice(0, 32),
      keys: [...new Set([...(old.keys || []), String(key || '')].filter(Boolean))].slice(-8),
      notes: body ? [...notes, { text: body, key: String(key || ''), at: Date.now() }].slice(-5) : notes.slice(-5),
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
    const notes = normalizeNotes(c.notes);
    if (notes.length) parts.push(`之前聊过：${notes.map((n) => n.text).join(' / ')}`);
    return parts.join('；').slice(0, 300);
  }

  function list() {
    return Object.entries(data).map(([id, c]) => ({
      id, name: c.name || '', keys: c.keys || [], at: Number(c.at) || 0,
      notes: normalizeNotes(c.notes)
    })).sort((a, b) => b.at - a.at);
  }

  function forget({ id = '', name = '', text = '' } = {}) {
    let uid = String(id || '').trim();
    if (!uid && name) uid = Object.keys(data).find((k) => String(data[k]?.name || '') === String(name)) || '';
    if (!uid || !data[uid]) return false;
    const needle = String(text || '').trim();
    if (!needle) { delete data[uid]; persist(); return true; }
    const notes = normalizeNotes(data[uid].notes).filter((n) => !n.text.includes(needle));
    if (!notes.length) delete data[uid];
    else data[uid].notes = notes;
    persist();
    return true;
  }

  return { remember, describe, list, forget, data };
}
