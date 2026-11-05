import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

function normalize(item) {
  const term = String(item?.term ?? item?.content ?? '').trim();
  if (!term) return null;
  return {
    term,
    meaning: String(item?.meaning ?? '').trim(),
    usage: String(item?.usage ?? item?.example ?? '').trim(),
    evidence: item?.evidence ?? [],
    status: String(item?.status ?? '').trim(),
    source: String(item?.source ?? '').trim()
  };
}

export function loadSlang(file, dbPath = '') {
  const entries = new Map();
  try {
    const list = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const raw of Array.isArray(list) ? list : []) {
      const item = normalize(raw);
      if (item) entries.set(item.term, item);
    }
  } catch {}
  if (dbPath && fs.existsSync(dbPath)) {
    let db = null;
    try {
      db = new DatabaseSync(dbPath, { readOnly: true });
      const rows = db.prepare('SELECT term, meaning, usage, evidence FROM slang').all();
      for (const raw of rows) {
        const item = normalize(raw);
        if (!item) continue;
        const old = entries.get(item.term);
        entries.set(item.term, {
          ...(old || {}),
          ...item,
          meaning: item.meaning || old?.meaning || '',
          usage: item.usage || old?.usage || ''
        });
      }
    } catch {
    } finally {
      try { db?.close(); } catch {}
    }
  }
  return [...entries.values()];
}

export function matchSlang(text, entries) {
  const value = String(text ?? '');
  return entries
    .filter((x) => value.includes(String(x.term)))
    .slice(0, 3)
    .map((x) => `${x.term}：${x.meaning || '群里常用说法'}`);
}
