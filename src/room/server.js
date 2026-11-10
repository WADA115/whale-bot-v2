import http from 'node:http';
import os from 'node:os';
import crypto from 'node:crypto';

const MAX_BODY = 1_000_000;
const MAX_MESSAGES = 500;

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const item of list || []) {
      if (item.family === 'IPv4' && !item.internal) out.push(item.address);
    }
  }
  return [...new Set(out)];
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(new Error('body too large')); req.destroy(); return; }
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

export function createRoomServer({ port = 3210, hostName = '房主', logger = null } = {}) {
  const rooms = new Map();
  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' });
      res.end();
      return;
    }
    try {
      const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
      if (req.method === 'POST' && url.pathname === '/api/room/create') {
        const body = await readJson(req);
        const name = String(body.name || '').trim().slice(0, 40) || '新房间';
        const roomId = crypto.randomBytes(3).toString('hex');
        const token = crypto.randomBytes(6).toString('hex');
        const clientId = String(body.clientId || crypto.randomUUID());
        const memberName = String(body.memberName || hostName).trim().slice(0, 24) || hostName;
        const room = { id: roomId, name, token, hostName: memberName, createdAt: Date.now(), messages: [], members: new Map() };
        room.members.set(clientId, { id: clientId, name: memberName, host: true, joinedAt: Date.now(), lastSeen: Date.now() });
        rooms.set(roomId, room);
        const addresses = lanAddresses();
        const invite = addresses[0] ? `${addresses[0]}:${port}#${roomId}#${token}` : `127.0.0.1:${port}#${roomId}#${token}`;
        logger?.info('room.created', { roomId, name });
        return send(res, 200, { ok: true, roomId, token, invite, addresses, port, member: { id: clientId, name: memberName, host: true } });
      }

      if (req.method === 'POST' && url.pathname === '/api/room/join') {
        const body = await readJson(req);
        const room = rooms.get(String(body.roomId || ''));
        if (!room || room.token !== String(body.token || '')) return send(res, 403, { error: '邀请码无效' });
        const clientId = String(body.clientId || crypto.randomUUID());
        const name = String(body.name || '').trim().slice(0, 24) || `客人${room.members.size + 1}`;
        const existing = room.members.get(clientId);
        room.members.set(clientId, { id: clientId, name: existing?.name || name, host: Boolean(existing?.host), joinedAt: existing?.joinedAt || Date.now(), lastSeen: Date.now() });
        logger?.info('room.joined', { roomId: room.id, name });
        return send(res, 200, { ok: true, roomId: room.id, name: room.name, hostName: room.hostName, member: room.members.get(clientId), addresses: lanAddresses() });
      }

      if (req.method === 'GET' && url.pathname === '/api/room/state') {
        const room = rooms.get(String(url.searchParams.get('roomId') || ''));
        if (!room || room.token !== String(url.searchParams.get('token') || '')) return send(res, 403, { error: '邀请码无效' });
        const clientId = String(url.searchParams.get('clientId') || '');
        const member = room.members.get(clientId);
        if (!member) return send(res, 403, { error: '不在房间' });
        member.lastSeen = Date.now();
        const since = Number(url.searchParams.get('since') || 0) || 0;
        const messages = room.messages.filter((m) => m.at > since);
        return send(res, 200, {
          ok: true,
          room: { id: room.id, name: room.name, hostName: room.hostName },
          members: [...room.members.values()].map((m) => ({ id: m.id, name: m.name, host: m.host, lastSeen: m.lastSeen })),
          messages,
          addresses: lanAddresses(),
          port
        });
      }

      if (req.method === 'POST' && url.pathname === '/api/room/send') {
        const body = await readJson(req);
        const room = rooms.get(String(body.roomId || ''));
        if (!room || room.token !== String(body.token || '')) return send(res, 403, { error: '邀请码无效' });
        const member = room.members.get(String(body.clientId || ''));
        if (!member) return send(res, 403, { error: '不在房间' });
        const text = String(body.text || '').trim().slice(0, 2000);
        if (!text) return send(res, 400, { error: '空消息' });
        const message = { id: crypto.randomUUID(), at: Date.now(), clientId: member.id, name: member.name, text };
        room.messages.push(message);
        if (room.messages.length > MAX_MESSAGES) room.messages.splice(0, room.messages.length - MAX_MESSAGES);
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
        server.listen(port, '0.0.0.0', () => { logger?.info('room.listening', { port }); resolve(true); });
      });
    },
    close() { try { server.close(); } catch {} },
    rooms
  };
}
