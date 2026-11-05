import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function parseTerms(text) {
  const raw = String(text ?? '').trim();
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const list = JSON.parse(match[0]);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function clean(value, max = 200) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function createSlangObserver({
  file,
  dbPath,
  entries = [],
  textRouter,
  config = {},
  logger = null
} = {}) {
  const batchSize = Math.max(5, Number(config.batchSize) || 20);
  const intervalMs = Math.max(60_000, Number(config.intervalMs) || 5 * 60 * 1000);
  const maxPerRun = Math.max(1, Number(config.maxPerRun) || 8);
  const pending = new Map();
  let total = 0;
  let busy = false;
  let timer = null;

  function pendingLines() {
    const lines = [];
    for (const [key, room] of pending) {
      for (const item of room) lines.push({ ...item, key });
    }
    return lines.sort((a, b) => a.at - b.at).slice(-80);
  }

  function remember(term, meaning, usage, evidence) {
    const old = entries.find((x) => x.term === term);
    if (old) {
      old.meaning = old.meaning || meaning;
      old.usage = old.usage || usage;
      old.evidence = [...(old.evidence || []), evidence].slice(-5);
      return false;
    }
    entries.push({ term, meaning, usage, evidence: [evidence], status: 'candidate', source: 'group-observer' });
    return true;
  }

  function persist() {
    if (file) {
      try {
        fs.writeFileSync(file, JSON.stringify(entries, null, 2) + '\n', 'utf8');
      } catch (error) {
        logger?.warn('slang.write_failed', { error: String(error?.message ?? error) });
      }
    }
    if (!dbPath || !fs.existsSync(dbPath)) return;
    let db = null;
    try {
      db = new DatabaseSync(dbPath);
      db.exec(`CREATE TABLE IF NOT EXISTS slang (
        term TEXT PRIMARY KEY,
        meaning TEXT DEFAULT '',
        evidence TEXT DEFAULT '',
        confidence REAL DEFAULT 0,
        updated_at INTEGER NOT NULL
      )`);
      const cols = db.prepare('PRAGMA table_info(slang)').all().map((x) => x.name);
      if (!cols.includes('usage')) db.exec("ALTER TABLE slang ADD COLUMN usage TEXT DEFAULT ''");
      const stmt = db.prepare(`INSERT INTO slang (term, meaning, usage, evidence, confidence, updated_at)
        VALUES (?, ?, ?, ?, 0.5, ?)
        ON CONFLICT(term) DO UPDATE SET
          meaning = CASE WHEN excluded.meaning <> '' THEN excluded.meaning ELSE slang.meaning END,
          usage = CASE WHEN excluded.usage <> '' THEN excluded.usage ELSE slang.usage END,
          evidence = excluded.evidence,
          updated_at = excluded.updated_at`);
      const now = Date.now();
      for (const item of entries) {
        stmt.run(item.term, item.meaning || '', item.usage || '', JSON.stringify(item.evidence || []), now);
      }
    } catch (error) {
      logger?.warn('slang.db_write_failed', { error: String(error?.message ?? error) });
    } finally {
      try { db?.close(); } catch {}
    }
  }

  async function flush() {
    if (busy || !total || !textRouter) return;
    busy = true;
    const lines = pendingLines();
    pending.clear();
    total = 0;
    try {
      const known = entries.slice(-40).map((x) => x.term).join('、');
      const transcript = lines.map((x) => `${x.sender}：${x.text}`).join('\n');
      const system = [
        '你在看 QQ 群聊。',
        '只找真正的黑话、梗、网络表达、圈子里的特殊说法。',
        '普通词、正常聊天、单纯语气词不要。',
        known ? `已经知道的：${known}` : '',
        '',
        '群聊：',
        transcript,
        '',
        '只输出 JSON 数组，不要解释。',
        '每项：{"term":"原词","meaning":"在这个群里是什么意思","usage":"怎么用"}',
        '没有就输出 []。'
      ].filter(Boolean).join('\n');
      const answer = await textRouter.generate({ system, user: '' });
      const terms = parseTerms(answer?.text).slice(0, maxPerRun);
      let added = 0;
      for (const item of terms) {
        const term = clean(item?.term, 20);
        const meaning = clean(item?.meaning, 160);
        const usage = clean(item?.usage, 120);
        if (!term || !meaning) continue;
        if (!transcript.includes(term)) continue;
        if (entries.some((x) => x.term === term)) continue;
        const evidence = lines
          .filter((x) => x.text.includes(term))
          .slice(0, 3)
          .map((x) => ({ key: x.key, sender: x.sender, text: x.text, time: x.at }));
        if (remember(term, meaning, usage, evidence[0] || {})) added += 1;
      }
      if (added) {
        persist();
        logger?.info('slang.observed', { added, terms: terms.slice(0, added).map((x) => x.term) });
      }
    } catch (error) {
      logger?.warn('slang.extract_failed', { error: String(error?.message ?? error) });
    } finally {
      busy = false;
    }
  }

  function observe(message) {
    if (!message || message.kind !== 'group') return;
    const allowed = Array.isArray(config.allowedGroups) ? config.allowedGroups.map(String) : [];
    if (allowed.length && !allowed.includes(String(message.id))) return;
    const text = clean(message.text, 300);
    if (!text) return;
    const key = message.key;
    const room = pending.get(key) || [];
    room.push({
      sender: String(message.senderName || message.userId || '群友').slice(0, 24),
      text,
      at: Date.now()
    });
    while (room.length > 40) room.shift();
    pending.set(key, room);
    total += 1;
    if (total >= batchSize) flush();
  }

  function start() {
    if (timer) return;
    logger?.info('slang.observer_started', { batchSize, intervalMs });
    timer = setInterval(() => { flush(); }, intervalMs);
    timer.unref?.();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { observe, start, stop, flush, entries };
}
