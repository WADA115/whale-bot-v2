import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export function createKnowledge({ dbPath, topK = 4, logger = null } = {}) {
  let db = null;
  function open() {
    if (db) return db;
    if (!dbPath || !fs.existsSync(dbPath)) return null;
    try {
      db = new DatabaseSync(dbPath, { readOnly: true });
    } catch (error) {
      logger?.warn('knowledge.open_failed', { error: String(error?.message ?? error) });
      return null;
    }
    return db;
  }

  function search(query, { limit = topK } = {}) {
    const text = String(query ?? '').trim();
    if (!text) return { lines: [], evidence: [] };
    const conn = open();
    if (!conn) return { lines: [], evidence: [] };
    const terms = [...new Set(text.split(/[\s，。！？、,.!?]+/).map((x) => x.trim()).filter((x) => x.length >= 2))].slice(0, 6);
    if (!terms.length) return { lines: [], evidence: [] };
    const rows = [];
    for (const term of terms) {
      try {
        const found = conn.prepare('SELECT id, document_id, text FROM chunks WHERE text LIKE ? LIMIT ?').all(`%${term}%`, Math.max(1, limit));
        for (const row of found) {
          if (!rows.some((x) => x.id === row.id)) rows.push(row);
        }
      } catch (error) {
        logger?.warn('knowledge.query_failed', { error: String(error?.message ?? error) });
      }
      if (rows.length >= limit) break;
    }
    return {
      lines: rows.slice(0, limit).map((r, i) => `[知识${i + 1}] ${String(r.text ?? '').slice(0, 240)}`),
      evidence: rows.slice(0, limit).map((r) => `doc:${r.document_id}#chunk:${r.id}`)
    };
  }

  function close() {
    try { db?.close(); } catch {}
    db = null;
  }
  return { search, close };
}
