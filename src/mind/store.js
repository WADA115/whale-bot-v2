import fs from 'node:fs';
import path from 'node:path';
import { durationWord } from './time.js';

const FILES = ['self.md', 'worldview.md', 'now.md', 'undercurrent.md', 'unfinished.md', 'seen.md', 'held.md'];

function readText(file) {
  try { return fs.readFileSync(file, 'utf8').trim(); } catch { return ''; }
}

function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, String(text ?? '').trim() + '\n', 'utf8');
}

function seedSelf(card) {
  return [
    '# 我',
    '',
    card?.identity || '',
    '',
    ...(card?.drive ? ['## 我为什么', '', String(card.drive).trim(), ''] : []),
    ...(!String(card?.drive ?? '').includes('如果没人叫我') ? ['## 我还在想', '', '如果没人叫我，我还算存在吗。', ''] : [])
  ].filter(Boolean).join('\n');
}

function seedWorld(card) {
  const lines = card?.world || [];
  return lines.length ? lines.map((line) => `- ${line}`).join('\n') : '';
}

export function createMindStore({ root, character = null, logger = null } = {}) {
  const base = root || path.resolve(process.cwd(), 'state', 'mind');
  fs.mkdirSync(base, { recursive: true });
  const presenceFile = path.join(base, 'presence.json');
  const readsFile = path.join(base, 'reads.json');
  const card = character?.card ?? null;

  function ensure() {
    const seeds = {
      'self.md': seedSelf(card),
      'worldview.md': seedWorld(card),
      'now.md': '',
      'undercurrent.md': '',
      'unfinished.md': '',
      'seen.md': '',
      'held.md': ''
    };
    for (const [name, content] of Object.entries(seeds)) {
      const file = path.join(base, name);
      if (!fs.existsSync(file)) writeText(file, content);
    }
    if (!fs.existsSync(presenceFile)) writeText(presenceFile, JSON.stringify({ createdAt: Date.now() }));
  }

  function readPresence() {
    try { return JSON.parse(fs.readFileSync(presenceFile, 'utf8')); } catch { return {}; }
  }

  function writePresence(patch = {}) {
    const next = { ...readPresence(), ...patch };
    writeText(presenceFile, JSON.stringify(next));
    return next;
  }

  function read() {
    ensure();
    return {
      self: readText(path.join(base, 'self.md')),
      worldview: readText(path.join(base, 'worldview.md')),
      now: readText(path.join(base, 'now.md')),
      undercurrent: readText(path.join(base, 'undercurrent.md')),
      unfinished: readText(path.join(base, 'unfinished.md')),
      seen: readText(path.join(base, 'seen.md')),
      held: readText(path.join(base, 'held.md')),
      reads: readReads(),
      presence: readPresence()
    };
  }

  function writeSection(section, text) {
    if (!FILES.includes(`${section}.md`)) throw new Error('invalid mind section');
    writeText(path.join(base, `${section}.md`), text);
    return read();
  }

  function appendUndercurrent(text) {
    const value = String(text ?? '').trim();
    if (!value) return read();
    const file = path.join(base, 'undercurrent.md');
    const before = readText(file);
    writeText(file, [before, value].filter(Boolean).join('\n\n---\n\n'));
    writePresence({ lastThoughtAt: Date.now() });
    return read();
  }

  function appendHeld(text, meta = '') {
    const value = String(text ?? '').trim();
    if (!value) return read();
    const file = path.join(base, 'held.md');
    const before = readText(file);
    const line = [meta ? `对${meta}` : '', value].filter(Boolean).join('：');
    writeText(file, [before, line].filter(Boolean).join('\n\n---\n\n'));
    return read();
  }

  function renderSelf(nextCard = card) {
    ensure();
    const old = readText(path.join(base, 'self.md'));
    const anchor = old.match(/## 我还在想\s*\n([\s\S]*?)(?=\n## |$)/)?.[1]?.trim()
      || '如果没人叫我，我还算存在吗。';
    const lines = [
      '# 我',
      '',
      String(nextCard?.identity || '').trim(),
      ''
    ];
    if (nextCard?.drive) lines.push('## 我为什么', '', String(nextCard.drive).trim(), '');
    if (nextCard?.world?.length) lines.push('## 我见过的', '', ...nextCard.world.map((x) => `- ${x}`), '');
    if (nextCard?.voice?.length) lines.push('## 我说话的样子', '', ...nextCard.voice.map((x) => `- ${x}`), '');
    if (nextCard?.boundaries?.length) lines.push('## 运行底线', '', ...nextCard.boundaries.map((x) => `- ${x}`), '');
    lines.push('## 我还在想', '', anchor, '');
    return lines.filter((x) => x !== undefined).join('\n').trim() + '\n';
  }

  function syncCard(nextCard = card) {
    ensure();
    const file = path.join(base, 'self.md');
    const next = renderSelf(nextCard);
    if (readText(file) === next.trim()) return read();
    writeText(file, next);
    return read();
  }

  function beginSession() {
    ensure();
    const presence = readPresence();
    const last = Number(presence.lastAliveAt || presence.lastShutdownAt || presence.createdAt) || 0;
    const gap = last ? Date.now() - last : 0;
    const wake = gap > 10 * 60 * 1000 ? { word: durationWord(gap), at: Date.now() } : null;
    const next = writePresence({
      lastAliveAt: Date.now(),
      lastBootAt: Date.now(),
      pendingWake: wake || presence.pendingWake || null
    });
    return { gap, wake: next.pendingWake };
  }

  function heartbeat() {
    return writePresence({ lastAliveAt: Date.now() });
  }

  function markShutdown() {
    return writePresence({ lastShutdownAt: Date.now(), lastAliveAt: Date.now() });
  }

  function peekWake() {
    return readPresence().pendingWake || null;
  }

  function takeWake() {
    const presence = readPresence();
    const wake = presence.pendingWake || null;
    if (wake) writePresence({ pendingWake: null });
    return wake;
  }

  function readReads() {
    try { return JSON.parse(fs.readFileSync(readsFile, 'utf8')); } catch { return []; }
  }

  function noteVoice(text) {
    const value = String(text ?? '').trim().slice(0, 500);
    if (value) writePresence({ pendingVoice: { text: value, at: Date.now() } });
    return value;
  }

  function takeVoice() {
    const pending = readPresence().pendingVoice;
    if (!pending) return '';
    writePresence({ pendingVoice: null });
    return String(pending.text || '');
  }

  function noteRead(entry = {}) {
    const list = readReads();
    list.unshift({ ...entry, at: Date.now() });
    writeText(readsFile, JSON.stringify(list.slice(0, 20)));
    const pending = readPresence().pendingRead;
    if (pending && pending.bvid === entry.bvid) writePresence({ pendingRead: null });
    return list.slice(0, 20);
  }

  function setPendingRead(item = {}) {
    return writePresence({ pendingRead: item && item.bvid ? item : null });
  }

  function peekPendingRead() {
    return readPresence().pendingRead || null;
  }

  function appendSeen(lines) {
    const list = (Array.isArray(lines) ? lines : [lines])
      .map((line) => String(line ?? '').trim())
      .filter(Boolean);
    if (!list.length) return read();
    const file = path.join(base, 'seen.md');
    const before = readText(file);
    const added = [...new Set(list)].filter((line) => !before.includes(line));
    if (added.length) writeText(file, [before, ...added.map((line) => `- ${line}`)].filter(Boolean).join('\n'));
    return read();
  }

  function touchContact() {
    return writePresence({ lastContactAt: Date.now() });
  }

  function touchThought() {
    return writePresence({ lastThoughtAt: Date.now() });
  }

  function canReach() {
    const presence = readPresence();
    const last = Number(presence.lastReachOutAt) || 0;
    const day = new Date().toISOString().slice(0, 10);
    return Date.now() - last > 6 * 60 * 60 * 1000 && presence.reachDay !== day;
  }

  function noteReach() {
    return writePresence({ lastReachOutAt: Date.now(), reachDay: new Date().toISOString().slice(0, 10), lastContactAt: Date.now() });
  }

  function canQzone() {
    const presence = readPresence();
    const last = Number(presence.lastQzoneAt) || 0;
    const day = new Date().toISOString().slice(0, 10);
    return Date.now() - last > 6 * 60 * 60 * 1000 && presence.qzoneDay !== day;
  }

  function noteImage(text) {
    const value = String(text ?? '').trim();
    if (!value) return readPresence();
    return writePresence({ lastImage: { text: value.slice(0, 600), at: Date.now() } });
  }

  function noteQzone() {
    return writePresence({ lastQzoneAt: Date.now(), qzoneDay: new Date().toISOString().slice(0, 10), lastContactAt: Date.now() });
  }

  try { syncCard(card); } catch {}
  return { ensure, read, writeSection, appendUndercurrent, appendHeld, appendSeen, noteRead, readReads, setPendingRead, peekPendingRead, touchContact, touchThought, readPresence, beginSession, heartbeat, markShutdown, peekWake, takeWake, canReach, noteReach, canQzone, noteQzone, noteImage, noteVoice, takeVoice, syncCard, base };
}
