import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const LOCK_STALE_MS = 15_000;
const LOCK_WAIT_MS = 2_000;

function safe(key) {
  return String(key ?? '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120) || 'default';
}

function selfFromCard(card) {
  return [
    '# 我',
    '',
    card.identity || '',
    '',
    '## 说话',
    ...(card.voice || []).map((x) => `- ${x}`),
    '',
    '## 在意',
    ...(card.values || []).map((x) => `- ${x}`),
    '',
    '## 边界',
    ...(card.boundaries || []).map((x) => `- ${x}`),
    '',
    '## 心理成熟',
    ...(card.maturity || []).map((x) => `- ${x}`),
    ''
  ].join('\n');
}

function readText(file) {
  try { return fs.readFileSync(file, 'utf8').trim(); } catch { return ''; }
}

function titleOf(text) {
  return String(text ?? '').split('\n').find((x) => x.trim().startsWith('#'))?.replace(/^#+\s*/, '').trim() || '';
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function atomicWrite(file, text) {
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  fs.writeFileSync(tmp, text, 'utf8');
  try {
    fs.renameSync(tmp, file);
  } catch {
    try { fs.rmSync(file, { force: true }); } catch {}
    fs.renameSync(tmp, file);
  }
}

export function createStoryStore({ root, logger = null } = {}) {
  function dirOf(key) {
    return path.join(root, safe(key));
  }

  function ensure(key, card = null) {
    const dir = dirOf(key);
    fs.mkdirSync(path.join(dir, 'episodes'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'chapters'), { recursive: true });
    const files = {
      'self.md': card ? selfFromCard(card) : '# 我\n\n我还不知道自己是谁。\n',
      'relationship.md': '# 我们\n\n还不熟。\n',
      'now.md': '# 此刻\n\n没什么特别想的，先听他说。\n'
    };
    for (const [name, content] of Object.entries(files)) {
      const file = path.join(dir, name);
      if (!fs.existsSync(file)) atomicWrite(file, content);
    }
    return dir;
  }

  function metaOf(dir) {
    const file = path.join(dir, '.meta.json');
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      const version = Number(parsed.version);
      return {
        version: Number.isFinite(version) && version >= 0 ? Math.floor(version) : 0,
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
        lastWriter: typeof parsed.lastWriter === 'string' ? parsed.lastWriter : ''
      };
    } catch {
      return { version: 0, updatedAt: '', lastWriter: '' };
    }
  }

  function bumpMeta(dir, writer) {
    const previous = metaOf(dir);
    const next = {
      version: previous.version + 1,
      updatedAt: new Date().toISOString(),
      lastWriter: String(writer || '')
    };
    atomicWrite(path.join(dir, '.meta.json'), JSON.stringify(next, null, 2) + '\n');
    return next;
  }

  function withLock(key, fn) {
    const dir = ensure(key);
    const lock = path.join(dir, '.lock');
    const started = Date.now();
    let fd = null;
    while (Date.now() - started <= LOCK_WAIT_MS) {
      try {
        fd = fs.openSync(lock, 'wx');
        break;
      } catch {
        try {
          const stat = fs.statSync(lock);
          if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) fs.rmSync(lock, { force: true });
        } catch {}
        sleep(10);
      }
    }
    if (fd == null) throw new Error('story lock timeout');
    try {
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), 'utf8');
      return fn(dir);
    } finally {
      try { fs.closeSync(fd); } catch {}
      try { fs.rmSync(lock, { force: true }); } catch {}
    }
  }

  function episodesOf(key) {
    const dir = path.join(dirOf(key), 'episodes');
    let names = [];
    try { names = fs.readdirSync(dir); } catch { return []; }
    return names.map((name) => {
      const full = path.join(dir, name);
      try {
        if (fs.statSync(full).isDirectory()) {
          const trace = readText(path.join(full, 'trace.md'));
          const archive = readText(path.join(full, 'episode.md'));
          return { id: name, title: titleOf(trace) || titleOf(archive), text: trace || archive };
        }
      } catch {}
      if (name.endsWith('.md')) {
        const text = readText(full);
        return { id: name, title: titleOf(text), text };
      }
      return null;
    }).filter((x) => x && x.text).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  }

  function read(key, card = null) {
    const dir = ensure(key, card);
    const meta = metaOf(dir);
    const readFile = (name) => readText(path.join(dir, name));
    const episodes = episodesOf(key).slice(-3);
    let chapters = [];
    try {
      const chapterDir = path.join(dir, 'chapters');
      chapters = fs.readdirSync(chapterDir)
        .filter((name) => name.endsWith('.md'))
        .sort()
        .slice(-2)
        .map((name) => ({ name, text: readText(path.join(chapterDir, name)) }))
        .filter((x) => x.text);
    } catch {}
    return {
      self: readFile('self.md'),
      relationship: readFile('relationship.md'),
      now: readFile('now.md'),
      episodes,
      chapters,
      version: meta.version,
      updatedAt: meta.updatedAt
    };
  }

  function personFile(dir, personId) {
    const people = path.join(dir, 'people');
    fs.mkdirSync(people, { recursive: true });
    return path.join(people, `${safe(personId)}.md`);
  }

  function parsePerson(text, id = '') {
    const source = String(text ?? '');
    const section = (name) => {
      const re = new RegExp(`##\\s*${name}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`);
      return (source.match(re)?.[1] || '').trim();
    };
    return {
      id,
      head: section('头部'),
      middle: section('中部'),
      tail: section('尾部')
    };
  }

  function readPerson(key, personId, card = null) {
    const dir = ensure(key, card);
    return parsePerson(readText(personFile(dir, personId)), personId);
  }

  function writePerson(key, personId, patch = {}, card = null) {
    return withLock(key, (dir) => {
      const file = personFile(dir, personId);
      const current = parsePerson(readText(file), personId);
      const next = {
        head: patch.head ? String(patch.head).trim() : current.head,
        middle: patch.middle ? String(patch.middle).trim() : current.middle,
        tail: patch.tail ? String(patch.tail).trim() : current.tail
      };
      if (!next.head && !next.middle && !next.tail) return current;
      const body = [
        '# 他',
        '',
        '## 头部',
        next.head,
        '',
        '## 中部',
        next.middle,
        '',
        '## 尾部',
        next.tail,
        ''
      ].join('\n');
      atomicWrite(file, body);
      bumpMeta(dir, 'person');
      return next;
    });
  }

  function listPeople(key) {
    const dir = ensure(key);
    const people = path.join(dir, 'people');
    let names = [];
    try { names = fs.readdirSync(people).filter((x) => x.endsWith('.md')); } catch { return []; }
    return names.map((name) => parsePerson(readText(path.join(people, name)), name.replace(/\.md$/, '')))
      .filter((x) => x.head || x.middle || x.tail);
  }

  function forgetPerson(key, personId) {
    return withLock(key, (dir) => {
      try { fs.rmSync(personFile(dir, personId), { force: true }); } catch {}
      bumpMeta(dir, 'person:forget');
      return true;
    });
  }
  function writeSection(key, section, text, card = null) {
    const allowed = new Set(['self', 'relationship', 'now']);
    if (!allowed.has(section)) throw new Error('invalid story section');
    return withLock(key, (dir) => {
      atomicWrite(path.join(dir, `${section}.md`), String(text ?? '').trim() + '\n');
      return bumpMeta(dir, `section:${section}`);
    });
  }

  function addEpisodeInternal(dir, title, full, trace) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const id = `${stamp}-${safe(title).slice(0, 40) || 'episode'}`;
    const eventDir = path.join(dir, 'episodes', id);
    fs.mkdirSync(eventDir, { recursive: true });
    const heading = `# ${title || '一件小事'}`;
    atomicWrite(path.join(eventDir, 'episode.md'), `${heading}\n\n${String(full ?? '').trim()}\n`);
    atomicWrite(path.join(eventDir, 'trace.md'), `${heading}\n\n${String(trace ?? full ?? '').trim()}\n`);
    return id;
  }

  function addEpisode(key, title, full, traceOrCard = null, card = null) {
    let ownerCard = card;
    let trace = traceOrCard;
    if (traceOrCard && typeof traceOrCard === 'object') {
      ownerCard = traceOrCard;
      trace = full;
    }
    return withLock(key, (dir) => {
      const id = addEpisodeInternal(dir, title, full, trace);
      bumpMeta(dir, 'episode');
      return id;
    });
  }

  function writeTrace(key, id, text, card = null) {
    return withLock(key, (dir) => {
      const eventDir = path.join(dir, 'episodes', safe(id));
      fs.mkdirSync(eventDir, { recursive: true });
      atomicWrite(path.join(eventDir, 'trace.md'), String(text ?? '').trim() + '\n');
      return bumpMeta(dir, 'trace');
    });
  }

  function addChapterInternal(dir, title, text) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const name = `${stamp}-${safe(title).slice(0, 40) || 'chapter'}.md`;
    atomicWrite(path.join(dir, 'chapters', name), `# ${title || '一章'}\n\n${String(text ?? '').trim()}\n`);
    return name;
  }

  function addChapter(key, title, text, card = null) {
    return withLock(key, (dir) => {
      const name = addChapterInternal(dir, title, text);
      bumpMeta(dir, 'chapter');
      return name;
    });
  }

  function findEpisode(key, title) {
    const wanted = String(title ?? '').trim();
    return episodesOf(key).find((x) => String(x.title).trim() === wanted) ?? null;
  }

  function listEpisodes(key) {
    return episodesOf(key).map((x) => x.id);
  }

  function listChats() {
    try {
      return fs.readdirSync(root, { withFileTypes: true })
        .filter((x) => x.isDirectory() && x.name !== 'private_demo')
        .map((x) => x.name)
        .sort();
    } catch {
      return [];
    }
  }

  function apply(key, parsed, card = null, expectedVersion = null) {
    return withLock(key, (dir) => {
      const before = metaOf(dir);
      if (expectedVersion != null && before.version !== expectedVersion) {
        const error = new Error('story version conflict');
        error.code = 'STORY_CONFLICT';
        throw error;
      }
      if (parsed.now) atomicWrite(path.join(dir, 'now.md'), String(parsed.now).trim() + '\n');
      if (parsed.relationship) atomicWrite(path.join(dir, 'relationship.md'), String(parsed.relationship).trim() + '\n');
      if (parsed.event?.title) {
        addEpisodeInternal(dir, parsed.event.title, parsed.event.full || parsed.event.trace || '', parsed.event.trace || parsed.event.full || '');
      }
      if (parsed.old?.title) {
        const found = episodesOf(key).find((x) => String(x.title).trim() === String(parsed.old.title).trim());
        if (found) {
          atomicWrite(
            path.join(dir, 'episodes', safe(found.id), 'trace.md'),
            `${'# ' + (parsed.old.title || '一件小事')}\n\n${String(parsed.old.trace ?? '').trim()}\n`
          );
        }
      }
      if (parsed.chapter?.title) addChapterInternal(dir, parsed.chapter.title, parsed.chapter.text || '');
      const changed = Boolean(parsed.now || parsed.relationship || parsed.event?.title || parsed.old?.title || parsed.chapter?.title);
      if (!changed) return before;
      return bumpMeta(dir, 'editor');
    });
  }

  return { ensure, read, writeSection, readPerson, writePerson, listPeople, forgetPerson, addEpisode, writeTrace, addChapter, findEpisode, listEpisodes, listChats, dirOf, apply };
}
