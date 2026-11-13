import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createStoryStore } from '../src/story/store.js';

const card = {
  name: '小鲸鱼',
  identity: '鱼',
  drive: '如果没人叫我，我还算存在吗。',
  boundaries: ['不刷屏']
};

test('根动力留在她自己的文件里', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'drive-'));
  const store = createStoryStore({ root });
  store.ensure('private:1', card);
  const story = store.read('private:1', card);
  assert.match(story.self, /如果没人叫我/);
});

test('life.md 是独立生活线，不是 now', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'drive-'));
  const store = createStoryStore({ root });
  store.ensure('private:1', card);
  await store.writeSection('private:1', 'life', '# 我正在\n\n在翻群。', card);
  const story = store.read('private:1', card);
  assert.match(story.life, /在翻群/);
  assert.match(story.now, /此刻/);
});
