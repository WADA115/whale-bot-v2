import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createStoryStore } from '../src/story/store.js';
import { buildNarrativePrompt } from '../src/story/prompt.js';

const card = {
  name: '小鲸鱼',
  identity: '鱼',
  drive: '如果没人叫我，我还算存在吗。',
  voice: ['短句'],
  values: ['被当成人'],
  boundaries: ['不刷屏']
};

test('根动力进入 prompt', () => {
  const prompt = buildNarrativePrompt({
    card,
    story: { self: '我是鱼', relationship: '不熟', now: '在听', life: '# 我正在\n\n刚看完一个视频。' },
    turns: []
  });
  assert.match(prompt.system, /如果没人叫我/);
  assert.match(prompt.user, /我正在/);
  assert.match(prompt.user, /刚看完一个视频/);
});

test('life.md 是独立生活线，不是 now', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'drive-'));
  const store = createStoryStore({ root });
  store.ensure('private:1', card);
  store.writeSection('private:1', 'life', '# 我正在\n\n在翻群。', card);
  const story = store.read('private:1', card);
  assert.match(story.life, /在翻群/);
  assert.match(story.now, /此刻/);
});
