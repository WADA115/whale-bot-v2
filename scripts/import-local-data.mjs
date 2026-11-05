#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const dbPath = CONFIG.knowledge?.dbPath || path.join(ROOT, 'state', 'knowledge', 'knowledge.db');
const v2File = CONFIG.character?.slangFile || path.join(ROOT, 'state', 'slang.json');
const v1File = process.env.V1_SLANG || 'E:/deepseek_qq.bot/qq-bridge/state/slang.json';

function read(file) {
  try {
    const list = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function normalize(item) {
  const term = String(item.term || item.content || '').trim();
  if (!term) return null;
  return {
    term,
    meaning: String(item.meaning || '').trim(),
    usage: String(item.usage || item.example || '').trim(),
    evidence: Array.isArray(item.evidence) ? item.evidence : (item.evidence ? [item.evidence] : []),
    status: String(item.status || '').trim(),
    source: String(item.source || '').trim()
  };
}

const merged = new Map();
for (const file of [v2File, v1File]) {
  for (const raw of read(file)) {
    const item = normalize(raw);
    if (!item) continue;
    const old = merged.get(item.term);
    if (!old) {
      merged.set(item.term, item);
      continue;
    }
    merged.set(item.term, {
      term: item.term,
      meaning: old.meaning || item.meaning,
      usage: old.usage || item.usage,
      evidence: [...(old.evidence || []), ...(item.evidence || [])],
      status: old.status || item.status,
      source: old.source || item.source
    });
  }
}

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS slang (
  term TEXT PRIMARY KEY,
  meaning TEXT DEFAULT '',
  evidence TEXT DEFAULT '',
  confidence REAL DEFAULT 0,
  updated_at INTEGER NOT NULL
)`);
const cols = db.prepare('PRAGMA table_info(slang)').all().map((x) => x.name);
if (!cols.includes('usage')) db.exec("ALTER TABLE slang ADD COLUMN usage TEXT DEFAULT ''");
const now = Date.now();
const upsert = db.prepare(`INSERT INTO slang (term, meaning, usage, evidence, confidence, updated_at)
  VALUES (?, ?, ?, ?, 0, ?)
  ON CONFLICT(term) DO UPDATE SET
    meaning = CASE WHEN excluded.meaning <> '' THEN excluded.meaning ELSE slang.meaning END,
    usage = CASE WHEN excluded.usage <> '' THEN excluded.usage ELSE slang.usage END,
    evidence = excluded.evidence,
    updated_at = excluded.updated_at`);
db.exec('BEGIN');
try {
  for (const item of merged.values()) {
    upsert.run(item.term, item.meaning, item.usage, JSON.stringify(item.evidence || []), now);
  }
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}
db.close();

fs.writeFileSync(v2File, JSON.stringify([...merged.values()].map((x) => ({
  term: x.term,
  meaning: x.meaning,
  usage: x.usage,
  evidence: x.evidence,
  status: x.status,
  source: x.source
})), null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ dbPath, slang: merged.size, v2File }));
