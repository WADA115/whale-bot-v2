import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRoomServer } from '../src/room/server.js';
import { createMediaLibrary } from '../src/core/media-library.js';
import { createScreen } from '../src/core/screen.js';

test('room-media 不能读取房间状态文件', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'room-media-'));
  const port = 34000 + Math.floor(Math.random() * 1000);
  const server = createRoomServer({ port, root, logger: null });
  assert.equal(await server.start(), true);
  try {
    const created = await fetch(`http://127.0.0.1:${port}/api/room/create`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'security', memberName: 'host', clientId: 'host-1' })
    }).then((res) => res.json());
    const status = await fetch(`http://127.0.0.1:${port}/room-media/${created.roomId}.json`);
    assert.ok([403, 404].includes(status.status), 'room state must not be readable');
    const traversal = await fetch(`http://127.0.0.1:${port}/room-media/${created.roomId}/media/..%2F..%2F${created.roomId}.json`);
    assert.ok([403, 404].includes(traversal.status), 'room state traversal must be blocked');
  } finally {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('媒体扩展名白名单拒绝 html', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'media-ext-'));
  try {
    const media = createMediaLibrary({ root });
    const item = media.addBuffer({ scope: 'user', kind: 'image', name: 'x.html', mime: 'text/html', buffer: Buffer.from('<html>') });
    assert.equal(path.extname(item.url), '.bin');
    const image = media.addBuffer({ scope: 'user', kind: 'image', name: 'x.png', mime: 'image/png', buffer: Buffer.from('png') });
    assert.equal(path.extname(image.url), '.png');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('屏幕权限关闭时 capture 拒绝', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'screen-test-'));
  try {
    const screen = createScreen({ root, scriptPath: 'noop.ps1' });
    await assert.rejects(() => screen.capture(), /screen permission disabled/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
