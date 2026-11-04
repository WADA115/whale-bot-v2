import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createMindStore } from '../src/mind/store.js';
import { createDaydream } from '../src/mind/daydream.js';
import { durationWord } from '../src/mind/time.js';

const card = { name: '鱼', identity: '鱼', drive: '如果没人叫我，我还算存在吗。', world: ['有人只回了一个字。'] };

test('暗流只写进文件，不发送', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mind-'));
  const mind = createMindStore({ root, character: { card } });
  mind.writeSection('now', '在听');
  const daydream = createDaydream({
    mind,
    textRouter: { generate: async () => ({ text: '屏幕亮了一下，不是他。' }) },
    character: { card }
  });
  const result = await daydream.run();
  assert.match(result.text, /屏幕/);
  assert.match(mind.read().undercurrent, /屏幕/);
  assert.match(mind.read().self, /如果没人叫我/);
});

test('暗流可以空白', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mind-empty-'));
  const mind = createMindStore({ root, character: { card } });
  const daydream = createDaydream({
    mind,
    textRouter: { generate: async () => ({ text: '' }) },
    character: { card }
  });
  await daydream.run();
  assert.equal(mind.read().undercurrent, '');
});
test('她知道断了多久，但不用数字', () => {
  assert.equal(durationWord(15 * 60 * 60 * 1000), '差不多一天');
  assert.equal(durationWord(72 * 60 * 60 * 1000), '三四天');
  assert.equal(durationWord(60 * 1000), '刚才断了一下');
});
test('发呆后可以自己决定发私聊', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mind-reach-'));
  const mind = createMindStore({ root, character: { card } });
  let sent = null;
  const daydream = createDaydream({
    mind,
    character: { card },
    config: { allow: { private: ['owner'] } },
    gateway: { ws: { readyState: 1 }, sendText: async (kind, id, text) => { sent = { kind, id, text }; } },
    textRouter: {
      generateWithTools: async ({ execute }) => {
        await execute('reach_out', { conversation: '他', text: '你在吗' });
        return { text: '发出去了。' };
      }
    }
  });
  await daydream.run();
  assert.deepEqual(sent, { kind: 'private', id: 'owner', text: '你在吗' });
});
test('给她看过的视频会进入 seen', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mind-seen-'));
  const mind = createMindStore({ root, character: { card } });
  mind.appendSeen('一个视频｜BV1abc123456｜UP');
  assert.match(mind.read().seen, /BV1abc123456/);
});
test('读全文后清掉待读标记', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mind-pending-'));
  const mind = createMindStore({ root, character: { card } });
  mind.setPendingRead({ bvid: 'BV1abc123456', title: '视频' });
  assert.equal(mind.peekPendingRead().bvid, 'BV1abc123456');
  mind.noteRead({ bvid: 'BV1abc123456', title: '视频', chars: 10 });
  assert.equal(mind.peekPendingRead(), null);
});