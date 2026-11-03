import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createMindStore } from '../src/mind/store.js';
import { createDaydream } from '../src/mind/daydream.js';

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
