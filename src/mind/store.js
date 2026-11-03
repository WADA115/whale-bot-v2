import fs from 'node:fs';
import path from 'node:path';

const FILES = ['self.md', 'worldview.md', 'now.md', 'undercurrent.md', 'unfinished.md'];

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
  const card = character?.card ?? null;

  function ensure() {
    const seeds = {
      'self.md': seedSelf(card),
      'worldview.md': seedWorld(card),
      'now.md': '',
      'undercurrent.md': '',
      'unfinished.md': ''
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

  function touchContact() {
    return writePresence({ lastContactAt: Date.now() });
  }

  function touchThought() {
    return writePresence({ lastThoughtAt: Date.now() });
  }

  return { ensure, read, writeSection, appendUndercurrent, touchContact, touchThought, readPresence, base };
}
