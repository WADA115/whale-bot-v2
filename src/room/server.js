import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { atomicWriteJson } from '../runtime/atomic.js';

const MAX_BODY = 24_000_000;
const MAX_MESSAGES = 500;
const MAX_MEDIA = 6;

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const item of list || []) {
      if (item.family === 'IPv4' && !item.internal) out.push(item.address);
    }
  }
  return [...new Set(out)];
}

function readJson(req, maxBytes = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (error) { reject(error); }
    });
    req.on('error', reject);
  });
}

function send(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'cache-control': 'no-store'
  });
  res.end(body);
}

function extFor(mime) {
  if (String(mime).includes('png')) return '.png';
  if (String(mime).includes('webp')) return '.webp';
  if (String(mime).includes('gif')) return '.gif';
  if (String(mime).includes('webm')) return '.webm';
  if (String(mime).includes('ogg') || String(mime).includes('opus')) return '.ogg';
  if (String(mime).includes('wav')) return '.wav';
  if (String(mime).includes('mpeg') || String(mime).includes('mp3')) return '.mp3';
  return '.jpg';
}

function typeFor(file) {
  const ext = path.extname(file).toLowerCase();
  return {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.webp': 'image/webp', '.gif': 'image/gif',
    '.webm': 'audio/webm', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg'
  }[ext] || 'application/octet-stream';
}

export function createRoomServer({ port = 3210, root = 'state/rooms', hostName = '房主', aiName = '小鲸鱼', onMessage = null, onAIEnabled = null, logger = null } = {}) {
  const rooms = new Map();
  fs.mkdirSync(root, { recursive: true });

  function fileFor(roomId) { return path.join(root, `${roomId}.json`); }
  function mediaDir(roomId) { return path.join(root, roomId, 'media'); }

  function memberFor(room, clientId, secret) {
    const member = room?.members?.get(String(clientId || ''));
    if (!member?.secret || String(secret || '') !== member.secret) return null;
    return member;
  }

  function persist(room) {
    const target = fileFor(room.id);
    try {
      atomicWriteJson(target, {
        id: room.id, name: room.name, token: room.token, hostName: room.hostName,
        createdAt: room.createdAt, aiEnabled: Boolean(room.aiEnabled), messages: room.messages,
        members: [...room.members.values()]
      });
    } catch (error) {
      logger?.warn('room.persist_failed', { roomId: room.id, error: String(error?.message ?? error) });
    }
  }

  function load() {
    let files = [];
    try { files = fs.readdirSync(root); } catch (error) {
      logger?.warn('room.load_failed', { error: String(error?.message ?? error) });
      return;
    }
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const source = path.join(root, file);
      try {
        const data = JSON.parse(fs.readFileSync(source, 'utf8'));
        if (!data?.id || !data?.token) throw new Error('room file missing id/token');
        const room = {
          id: String(data.id), name: String(data.name || '房间'), token: String(data.token),
          hostName: String(data.hostName || hostName), createdAt: Number(data.createdAt) || Date.now(),
          aiEnabled: Boolean(data.aiEnabled),
          messages: Array.isArray(data.messages) ? data.messages.slice(-MAX_MESSAGES) : [],
          members: new Map((Array.isArray(data.members) ? data.members : []).map((m) => [String(m.id), {
            id: String(m.id), name: String(m.name || '成员'), host: Boolean(m.host),
            secret: String(m.secret || ''), joinedAt: Number(m.joinedAt) || Date.now(), lastSeen: Number(m.lastSeen) || Date.now()
          }]))
        };
        rooms.set(room.id, room);
      } catch (error) {
        const corrupt = `${source}.corrupt-${Date.now()}`;
        try { fs.renameSync(source, corrupt); } catch { /* best-effort */ }
        logger?.warn('room.load_file_failed', { file, corrupt, error: String(error?.message ?? error) });
      }
    }
    logger?.info('room.loaded', { count: rooms.size });
  }
  load();

  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' });
      res.end();
      return;
    }
    try {
      const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
      if (req.method === 'GET' && url.pathname.startsWith('/room-media/')) {
        const rel = url.pathname.slice('/room-media/'.length);
        const parts = rel.split('/').filter(Boolean);
        if (parts.length !== 3 || parts[1] !== 'media' || !rooms.has(parts[0])) {
          return send(res, 403, { error: 'forbidden' });
        }
        const roomId = parts[0];
        if (rooms.get(roomId)?.token !== String(url.searchParams.get('token') || '')) {
          return send(res, 403, { error: 'forbidden' });
        }
        const base = path.resolve(mediaDir(roomId));
        const file = path.resolve(base, path.basename(parts[2]));
        if (!file.startsWith(base + path.sep)) return send(res, 403, { error: 'forbidden' });
        try {
          const body = fs.readFileSync(file);
          res.writeHead(200, {
            'content-type': typeFor(file),
            'content-length': body.length,
            'access-control-allow-origin': '*',
            'cache-control': 'no-cache'
          });
          res.end(body);
        } catch { send(res, 404, { error: 'not found' }); }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/room/create') {
        const body = await readJson(req);
        const name = String(body.name || '').trim().slice(0, 40) || '新房间';
        let roomId;
        do { roomId = crypto.randomBytes(3).toString('hex'); }
        while (rooms.has(roomId) || fs.existsSync(fileFor(roomId)));
        const token = crypto.randomBytes(6).toString('hex');
        const clientId = String(body.clientId || crypto.randomUUID());
        const memberName = String(body.memberName || hostName).trim().slice(0, 24) || hostName;
        const memberSecret = crypto.randomBytes(16).toString('hex');
        const room = { id: roomId, name, token, hostName: memberName, createdAt: Date.now(), aiEnabled: false, messages: [], members: new Map() };
        room.members.set(clientId, { id: clientId, name: memberName, host: true, secret: memberSecret, joinedAt: Date.now(), lastSeen: Date.now() });
        rooms.set(roomId, room);
        persist(room);
        const addresses = lanAddresses();
        const invite = addresses[0] ? `${addresses[0]}:${port}#${roomId}#${token}` : `127.0.0.1:${port}#${roomId}#${token}`;
        logger?.info('room.created', { roomId, name });
        return send(res, 200, { ok: true, roomId, token, memberSecret, invite, addresses, port, member: { id: clientId, name: memberName, host: true } });
      }

      if (req.method === 'POST' && url.pathname === '/api/room/join') {
        const body = await readJson(req);
        const room = rooms.get(String(body.roomId || ''));
        if (!room || room.token !== String(body.token || '')) return send(res, 403, { error: '邀请码无效' });
        const clientId = String(body.clientId || crypto.randomUUID());
        const name = String(body.name || '').trim().slice(0, 24) || `客人${room.members.size + 1}`;
        const existing = room.members.get(clientId);
        let member;
        if (existing) {
          if (!existing.secret || String(body.memberSecret || '') !== existing.secret) {
            return send(res, 403, { error: '身份校验失败，请重新进房' });
          }
          existing.lastSeen = Date.now();
          member = existing;
        } else {
          member = { id: clientId, name, host: false, secret: crypto.randomBytes(16).toString('hex'), joinedAt: Date.now(), lastSeen: Date.now() };
          room.members.set(clientId, member);
        }
        persist(room);
        logger?.info('room.joined', { roomId: room.id, name: member.name });
        return send(res, 200, { ok: true, roomId: room.id, name: room.name, hostName: room.hostName, memberSecret: member.secret, member: { id: member.id, name: member.name, host: member.host, ai: Boolean(member.ai) }, addresses: lanAddresses() });
      }

      if (req.method === 'GET' && url.pathname === '/api/room/state') {
        const room = rooms.get(String(url.searchParams.get('roomId') || ''));
        if (!room || room.token !== String(url.searchParams.get('token') || '')) return send(res, 403, { error: '邀请码无效' });
        const clientId = String(url.searchParams.get('clientId') || '');
        const member = memberFor(room, clientId, url.searchParams.get('memberSecret') || '');
        if (!member) return send(res, 403, { error: '身份校验失败' });
        member.lastSeen = Date.now();
        const since = Number(url.searchParams.get('since') || 0) || 0;
        const messages = room.messages.filter((m) => m.at > since);
        return send(res, 200, {
          ok: true,
          room: { id: room.id, name: room.name, hostName: room.hostName },
          aiEnabled: Boolean(room.aiEnabled),
          members: [...room.members.values()].map((m) => ({ id: m.id, name: m.name, host: m.host, ai: Boolean(m.ai), lastSeen: m.lastSeen })),
          messages,
          addresses: lanAddresses(),
          port
        });
      }

      if (req.method === 'POST' && url.pathname === '/api/room/media') {
        const body = await readJson(req);
        const room = rooms.get(String(body.roomId || ''));
        if (!room || room.token !== String(body.token || '')) return send(res, 403, { error: '邀请码无效' });
        const member = memberFor(room, body.clientId, body.memberSecret);
        if (!member) return send(res, 403, { error: '身份校验失败' });
        const kind = ['image', 'sticker', 'voice'].includes(String(body.kind)) ? String(body.kind) : 'image';
        const buffer = Buffer.from(String(body.data || ''), 'base64');
        if (!buffer.length) return send(res, 400, { error: '空文件' });
        if (buffer.length > 18 * 1024 * 1024) return send(res, 413, { error: '文件太大' });
        fs.mkdirSync(mediaDir(room.id), { recursive: true });
        const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 24);
        const file = `${hash}${extFor(String(body.mime || ''))}`;
        fs.writeFileSync(path.join(mediaDir(room.id), file), buffer);
        return send(res, 200, { ok: true, media: { kind, url: `/room-media/${room.id}/media/${file}?token=${encodeURIComponent(room.token)}`, mime: String(body.mime || '') } });
      }

      if (req.method === 'POST' && url.pathname === '/api/room/ai') {
        const body = await readJson(req);
        const room = rooms.get(String(body.roomId || ''));
        if (!room || room.token !== String(body.token || '')) return send(res, 403, { error: '邀请码无效' });
        const member = memberFor(room, body.clientId, body.memberSecret);
        if (!member?.host) return send(res, 403, { error: '只有房主能开关 AI' });
        room.aiEnabled = Boolean(body.enabled);
        if (room.aiEnabled) {
          room.members.set('ai', { id: 'ai', name: aiName, host: false, ai: true, joinedAt: Date.now(), lastSeen: Date.now() });
        } else {
          room.members.delete('ai');
        }
        persist(room);
        if (room.aiEnabled && onAIEnabled) { try { onAIEnabled(room); } catch (error) { logger?.warn('room.ai_enabled_failed', { roomId: room.id, error: String(error?.message ?? error) }); } }
        return send(res, 200, { ok: true, enabled: room.aiEnabled });
      }

      if (req.method === 'POST' && url.pathname === '/api/room/send') {
        const body = await readJson(req);
        const room = rooms.get(String(body.roomId || ''));
        if (!room || room.token !== String(body.token || '')) return send(res, 403, { error: '邀请码无效' });
        const member = memberFor(room, body.clientId, body.memberSecret);
        if (!member) return send(res, 403, { error: '身份校验失败' });
        const text = String(body.text || '').trim().slice(0, 2000);
        const media = (Array.isArray(body.media) ? body.media : []).slice(0, MAX_MEDIA).filter((item) => {
          const url = String(item?.url || '');
          return /^\/room-media\/[^/]+\/media\/[^/]+(?:\?[^#]*)?$/.test(url);
        }).map((item) => ({
          kind: ['image', 'sticker', 'voice'].includes(String(item.kind)) ? String(item.kind) : 'image',
          url: String(item.url),
          mime: String(item.mime || '')
        }));
        if (!text && !media.length) return send(res, 400, { error: '空消息' });
        const message = { id: crypto.randomUUID(), at: Date.now(), clientId: member.id, name: member.name, text, media };
        room.messages.push(message);
        if (room.messages.length > MAX_MESSAGES) room.messages.splice(0, room.messages.length - MAX_MESSAGES);
        persist(room);
        if (onMessage) { try { onMessage(room, message); } catch (error) { logger?.warn('room.message_handler_failed', { roomId: room.id, error: String(error?.message ?? error) }); } }
        return send(res, 200, { ok: true, message });
      }

      send(res, 404, { error: 'not found' });
    } catch (error) {
      send(res, 400, { error: String(error?.message ?? error) });
    }
  });

  return {
    start() {
      return new Promise((resolve) => {
        server.once('error', (error) => { logger?.warn('room.listen_failed', { error: String(error?.message ?? error) }); resolve(false); });
        server.listen(port, '0.0.0.0', () => { logger?.info('room.listening', { port, rooms: rooms.size }); resolve(true); });
      });
    },
    close() { try { server.close(); } catch { /* best-effort */ } },
    sendAI(roomId, text) {
      const room = rooms.get(String(roomId));
      if (!room || !room.aiEnabled) return null;
      const body = String(text || '').trim().slice(0, 2000);
      if (!body) return null;
      const message = { id: crypto.randomUUID(), at: Date.now(), clientId: 'ai', name: aiName, text: body, media: [], ai: true };
      room.messages.push(message);
      if (room.messages.length > MAX_MESSAGES) room.messages.splice(0, room.messages.length - MAX_MESSAGES);
      persist(room);
      return message;
    },
    rooms
  };
}
