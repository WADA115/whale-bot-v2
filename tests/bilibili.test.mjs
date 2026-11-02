import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createBilibili } from '../src/platform/bilibili.js';

test('B站扫码登录与状态', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-bili-'));
  const fetchImpl = async (url) => {
    if (url.includes('/qrcode/generate')) {
      return { ok: true, json: async () => ({ code: 0, data: { url: 'https://bili/qr', qrcode_key: 'k1' } }) };
    }
    if (url.includes('/qrcode/poll')) {
      return { ok: true, json: async () => ({ code: 0, data: { code: 0, url: 'https://bili/cb?SESSDATA=s1&bili_jct=j1&DedeUserID=42' } }) };
    }
    if (url.includes('/nav')) {
      return { ok: true, json: async () => ({ code: 0, data: { mid: 42, uname: '阿B', face: '' } }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const bili = createBilibili({ file: path.join(dir, 'bili.json'), fetchImpl });
  const qr = await bili.generate();
  assert.equal(qr.key, 'k1');
  const poll = await bili.poll(qr.key);
  assert.equal(poll.status, 'ok');
  assert.equal(poll.user.name, '阿B');
  const status = bili.status();
  assert.equal(status.loggedIn, true);
  assert.equal(status.user.mid, 42);
  fs.rmSync(dir, { recursive: true, force: true });
});
