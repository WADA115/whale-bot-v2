import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { searchBing } from '../core/web-search.js';

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

function imageSummary(message) {
  const segs = (message?.segments || []).filter((seg) => ['image', 'mface', 'face', 'bface', 'marketface'].includes(seg?.type));
  if (!segs.length) return '';
  const names = segs.map((seg) => seg?.data?.summary || seg?.data?.name || seg?.data?.text || '').filter(Boolean);
  return names.length ? `[表情：${names.join('、')}]` : '[图片/表情]';
}

export function createSlangObserver({
  file,
  search = searchBing,
  dbPath,
  entries = [],
  textRouter,
  vision = null,
  config = {},
  logger = null
} = {}) {
  const batchSize = Math.max(5, Number(config.batchSize) || 20);
  const intervalMs = Math.max(60_000, Number(config.intervalMs) || 5 * 60 * 1000);
  const maxPerRun = Math.max(1, Number(config.maxPerRun) || 8);
  const pending = new Map();
  const imageQueue = [];
  let imageWorker = false;
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

  function remember(term, meaning, usage, evidence, source = '') {
    const old = entries.find((x) => x.term === term);
    if (old) {
      old.meaning = old.meaning || meaning;
      old.usage = old.usage || usage;
      old.evidence = [...(old.evidence || []), evidence].slice(-5);
      return false;
    }
    entries.push({ term, meaning, usage, evidence: [evidence], status: 'candidate', source: source || 'group-observer' });
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

  function pushLine(message, text) {
    const key = message.key;
    const room = pending.get(key) || [];
    room.push({
      sender: String(message.senderName || message.userId || '群友').slice(0, 24),
      text: clean(text, 300),
      at: Date.now()
    });
    while (room.length > 40) room.shift();
    pending.set(key, room);
    total += 1;
    if (total >= batchSize) flush();
  }

  async function pumpImages() {
    if (imageWorker) return;
    imageWorker = true;
    try {
      while (imageQueue.length) {
        const item = imageQueue.shift();
        let text = imageSummary(item.message);
        if (vision && item.message.images?.length) {
          try {
            const described = await vision.describe({ message: item.message });
            const desc = clean(described?.text, 260);
            if (desc) text = `${text || '[图片]'} ${desc}`;
          } catch (error) {
            logger?.warn('slang.image_failed', { error: String(error?.message ?? error) });
          }
        }
        pushLine(item.message, text || '[图片]');
      }
    } finally {
      imageWorker = false;
    }
  }

  function observe(message) {
    if (!message || message.kind !== 'group') return;
    const allowed = Array.isArray(config.allowedGroups) ? config.allowedGroups.map(String) : [];
    if (allowed.length && !allowed.includes(String(message.id))) return;
    const text = clean(message.text, 300);
    if (text) {
      pushLine(message, text);
      return;
    }
    if (message.images?.length) {
      imageQueue.push({ message });
      pumpImages();
      return;
    }
    const sticker = imageSummary(message);
    if (sticker) pushLine(message, sticker);
  }

  async function waitImages() {
    while (imageWorker || imageQueue.length) await new Promise((resolve) => setTimeout(resolve, 20));
  }

  async function flush() {
    if (imageWorker || imageQueue.length) await waitImages();
    if (busy) { while (busy) await new Promise((r) => setTimeout(r, 20)); return; }
    if (!total || !textRouter) return;
    busy = true;
    const lines = pendingLines().slice(-24);
    logger?.info('slang.flush_start', { lines: lines.length });
    pending.clear();
    total = 0;
    try {
      const known = entries.slice(-40).map((x) => x.term).join('、');
      const transcript = lines.map((x) => `${x.sender}：${x.text}`).join('\n');
      const system = [
        '你在看 QQ 群聊，里面可能有文字、图片和表情包。',
        '只找真正的黑话、梗、网络表达、圈子里的特殊说法。',
        '只找需要结合网络语境才能解释的群内表达。',
        '图片里的字也算群聊内容。',
        known ? `已经知道的：${known}` : '',
        '',
        '群聊：',
        transcript,
        '',
        '只输出 JSON 数组，不要解释。',
        '每项：{"term":"原词","meaning":"在这个群里是什么意思","usage":"怎么用","worth":true}',
        '只有确实值得记的黑话才 worth=true；不确定、无意义、口癖或发图顺口的字填 false。',
        '没有就输出 []。'
      ].filter(Boolean).join('\n');
      const answer = await textRouter.generate({ system, user: '', maxTokens: 4000, temperature: 0.4 });
      logger?.info('slang.flushed', { lines: lines.length, chars: String(answer?.text || '').length });
      const terms = parseTerms(answer?.text).slice(0, maxPerRun);
      const researched = [];
      for (const item of terms) {
        const term = clean(item?.term, 20);
        if (!term || item?.worth === false) continue;
        let enriched = { ...item };
        let source = '';
        try {
          const hits = await search(`${term} 梗 意思 用法`, { limit: 4 });
          if (hits.length) {
            source = hits.map((x) => x.url).filter(Boolean).join(' ');
            const snippets = hits.map((x) => `- ${x.title}：${x.snippet}`).join('\n');
            const check = await textRouter.generate({
              system: '你在核对 QQ 群黑话。根据群聊原句和网络搜索，判断这个词在群里的真实意思和用法。只有网络能解释、确实值得记的才 worth=true。只输出 JSON：{"meaning":"...","usage":"...","worth":true}，不要 Markdown，不要解释。',
              user: `词：${term}\n群里的原句：${lines.filter((x) => x.text.includes(term)).slice(0, 2).map((x) => x.text).join('\n')}\n网络搜索：\n${snippets}`,
              maxTokens: 1200,
              temperature: 0.3
            });
            const match = String(check?.text || '').match(/\{[\s\S]*\}/);
            if (match) {
              const parsed = JSON.parse(match[0]);
              if (parsed.meaning) enriched.meaning = clean(parsed.meaning, 160);
              if (parsed.usage) enriched.usage = clean(parsed.usage, 120);
              if (parsed.worth === false) enriched.worth = false;
            }
          } else {
            enriched.worth = false;
          }
        } catch {}
        logger?.info('slang.researched', { term, meaning: clean(enriched.meaning, 80), source: Boolean(source) });
        researched.push({ ...enriched, source });
      }
      let added = 0;
      for (const item of researched) {
        const term = clean(item?.term, 20);
        const meaning = clean(item?.meaning, 160);
        const usage = clean(item?.usage, 120);
        if (!term || !meaning) continue;
        if (item?.worth === false) continue;
        if (!item.source) continue;
        if (!transcript.includes(term)) continue;
        if (lines.some((x) => x.sender === term)) continue;
        if (entries.some((x) => x.term === term)) continue;
        const evidence = lines
          .filter((x) => x.text.includes(term))
          .slice(0, 3)
          .map((x) => ({ key: x.key, sender: x.sender, text: x.text, time: x.at }));
        if (remember(term, meaning, usage, evidence[0] || {}, item.source || '')) added += 1;
      }
      if (added) {
        persist();
        logger?.info('slang.observed', { added, terms: terms.slice(0, added).map((x) => x.term) });
      }
    } catch (error) {
      for (const line of lines) {
        const room = pending.get(line.key) || [];
        room.push({ sender: line.sender, text: line.text, at: line.at });
        pending.set(line.key, room);
        total += 1;
      }
      logger?.warn('slang.extract_failed', { error: String(error?.message ?? error) });
    } finally {
      busy = false;
    }
  }

  function start() {
    if (timer) return;
    logger?.info('slang.observer_started', { batchSize, intervalMs, vision: Boolean(vision) });
    timer = setInterval(() => { flush(); }, intervalMs);
    timer.unref?.();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { observe, start, stop, flush, entries };
}
