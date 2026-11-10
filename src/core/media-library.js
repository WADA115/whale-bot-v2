import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SCOPES = new Set(['her', 'user']);
const KINDS = new Set(['image', 'sticker', 'voice']);

function extFor(mime, name = '') {
  const fromName = path.extname(String(name)).toLowerCase();
  if (fromName && fromName.length <= 6) return fromName;
  if (String(mime).includes('png')) return '.png';
  if (String(mime).includes('webp')) return '.webp';
  if (String(mime).includes('gif')) return '.gif';
  if (String(mime).includes('jpeg') || String(mime).includes('jpg')) return '.jpg';
  if (String(mime).includes('wav')) return '.wav';
  if (String(mime).includes('mpeg') || String(mime).includes('mp3')) return '.mp3';
  if (String(mime).includes('ogg') || String(mime).includes('opus')) return '.ogg';
  if (String(mime).includes('webm')) return '.webm';
  if (String(mime).includes('mp4')) return '.m4a';
  return '.bin';
}

function mimeFor(kind, mime) {
  if (mime) return String(mime);
  return kind === 'voice' ? 'audio/wav' : 'image/jpeg';
}

export function createMediaLibrary({ root = 'state/media', logger = null, maxBytes = 20 * 1024 * 1024 } = {}) {
  const base = root;
  for (const scope of SCOPES) fs.mkdirSync(path.join(base, scope), { recursive: true });
  const indexes = {};
  for (const scope of SCOPES) {
    try { indexes[scope] = JSON.parse(fs.readFileSync(path.join(base, scope, 'index.json'), 'utf8')); }
    catch { indexes[scope] = []; }
    if (!Array.isArray(indexes[scope])) indexes[scope] = [];
  }

  function persist(scope) {
    try {
      fs.writeFileSync(path.join(base, scope, 'index.json'), JSON.stringify(indexes[scope], null, 2) + '\n', 'utf8');
    } catch (error) { logger?.warn('media.index_failed', { scope, error: String(error?.message ?? error) }); }
  }

  function publicItem(scope, item) {
    return {
      id: item.id,
      scope,
      kind: item.kind,
      name: item.name,
      desc: item.desc || '',
      mime: item.mime,
      url: `/media/${scope}/${item.file}`,
      at: item.at
    };
  }

  function addBuffer({ scope = 'user', kind = 'image', buffer, mime = '', name = '', desc = '', origin = '' } = {}) {
    if (!SCOPES.has(scope)) throw new Error('invalid scope');
    if (!KINDS.has(kind)) throw new Error('invalid kind');
    if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('empty media');
    if (buffer.length > maxBytes) throw new Error('media too large');
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const found = indexes[scope].find((x) => x.hash === hash);
    if (found) return publicItem(scope, found);
    const ext = extFor(mime, name);
    const file = `${hash.slice(0, 24)}${ext}`;
    fs.writeFileSync(path.join(base, scope, file), buffer);
    const item = {
      id: hash.slice(0, 16),
      hash,
      kind,
      file,
      mime: mimeFor(kind, mime),
      name: String(name || file).slice(0, 120),
      desc: String(desc || '').slice(0, 200),
      origin: String(origin || '').slice(0, 200),
      at: Date.now()
    };
    indexes[scope].push(item);
    while (indexes[scope].length > 600) indexes[scope].shift();
    persist(scope);
    logger?.info('media.added', { scope, kind, bytes: buffer.length });
    return publicItem(scope, item);
  }

  function addFile({ scope = 'user', kind = 'image', file, mime = '', name = '', desc = '', origin = '' } = {}) {
    const buffer = fs.readFileSync(file);
    return addBuffer({ scope, kind, buffer, mime, name: name || path.basename(file), desc, origin });
  }

  async function addUrl({ scope = 'her', kind = 'sticker', url = '', mime = '', name = '', desc = '', origin = '' } = {}) {
    const raw = String(url || '');
    if (!raw) throw new Error('empty media url');
    let buffer;
    let type = mime;
    if (raw.startsWith('data:')) {
      const match = raw.match(/^data:([^;]+);base64,(.+)$/i);
      if (!match) throw new Error('invalid data url');
      type = type || match[1];
      buffer = Buffer.from(match[2], 'base64');
    } else if (/^https?:/i.test(raw)) {
      const res = await fetch(raw, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`media http ${res.status}`);
      type = type || String(res.headers.get('content-type') || '').split(';')[0];
      buffer = Buffer.from(await res.arrayBuffer());
    } else {
      buffer = fs.readFileSync(raw);
    }
    return addBuffer({ scope, kind, buffer, mime: type, name, desc, origin: origin || raw });
  }

  function list(scope = 'user', kind = '') {
    if (!SCOPES.has(scope)) return [];
    return indexes[scope]
      .filter((x) => !kind || x.kind === kind)
      .slice(-80)
      .reverse()
      .map((x) => publicItem(scope, x));
  }

  function get(scope, id) {
    if (!SCOPES.has(scope)) return null;
    const item = indexes[scope].find((x) => x.id === id || x.file === id);
    return item ? publicItem(scope, item) : null;
  }

  function remove(scope, id) {
    if (!SCOPES.has(scope)) return false;
    const index = indexes[scope].findIndex((x) => x.id === id || x.file === id);
    if (index < 0) return false;
    const [item] = indexes[scope].splice(index, 1);
    try { fs.rmSync(path.join(base, scope, item.file), { force: true }); } catch {}
    persist(scope);
    return true;
  }

  function filePath(scope, file) {
    if (!SCOPES.has(scope)) return null;
    const safe = path.basename(String(file || ''));
    if (!safe) return null;
    return path.join(base, scope, safe);
  }

  return { addBuffer, addFile, addUrl, list, get, remove, filePath, publicItem };
}
