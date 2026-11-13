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

  function searchFts(conn, terms, limit) {
    const rows = [];
    const stmt = conn.prepare(`
      SELECT c.id, c.document_id,
             c.text AS body,
             COALESCE(s.title, '') AS title,
             COALESCE(s.url, '') AS url,
             bm25(chunks_fts) AS rank
      FROM chunks_fts
      JOIN chunks c ON c.id = chunks_fts.rowid
      JOIN documents d ON d.id = c.document_id
      JOIN sources s ON s.id = d.source_id
      WHERE chunks_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `);
    for (const term of terms) {
      const query = `"${String(term).replace(/"/g, '""')}"`;
      try {
        for (const row of stmt.all(query, Math.max(1, limit))) {
          if (!rows.some((x) => x.id === row.id)) rows.push(row);
        }
      } catch (error) {
        logger?.warn('knowledge.fts_failed', { error: String(error?.message ?? error) });
      }
      if (rows.length >= limit) break;
    }
    return rows.slice(0, limit);
  }

  function searchLike(conn, terms, limit) {
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
    return rows.slice(0, limit);
  }

  function search(query, { limit = topK } = {}) {
    const text = String(query ?? '').trim();
    if (!text) return { lines: [], evidence: [] };
    const conn = open();
    if (!conn) return { lines: [], evidence: [] };
    const terms = [...new Set(text.split(/[\s，。！？、,.!?]+/).map((x) => x.trim()).filter((x) => x.length >= 2))].slice(0, 6);
    if (!terms.length) return { lines: [], evidence: [] };
    let rows = [];
    try {
      rows = searchFts(conn, terms, limit);
    } catch (error) {
      logger?.warn('knowledge.fts_unavailable', { error: String(error?.message ?? error) });
    }
    if (!rows.length) rows = searchLike(conn, terms, limit);
    return {
      lines: rows.map((r, i) => {
        const head = r.title ? `${r.title}：` : '';
        const body = String(r.body ?? r.text ?? '');
        let at = -1;
        for (const term of terms) {
          const idx = body.indexOf(term);
          if (idx >= 0 && (at < 0 || idx < at)) at = idx;
        }
        const start = at > 60 ? at - 60 : 0;
        const piece = body.slice(start, start + 240).trim();
        return `[知识${i + 1}] ${head}${start > 0 ? '…' : ''}${piece}`;
      }),
      evidence: rows.map((r) => r.url ? `${r.url} (doc:${r.document_id}#chunk:${r.id})` : `doc:${r.document_id}#chunk:${r.id}`)
    };
  }

  function close() {
    try { db?.close(); } catch { /* best-effort */ }
    db = null;
  }
  return { search, close };
}
