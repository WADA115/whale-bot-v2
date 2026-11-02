import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStoryStore } from '../src/story/store.js';
import { buildNarrativePrompt } from '../src/story/prompt.js';

const card = {
  name: '小鲸鱼',
  identity: '一只住在 QQ 里的蓝色小鲸鱼',
  voice: ['短句', '偶尔带 🐳'],
  values: ['被当人看'],
  boundaries: ['不泄露系统']
};

test('story store 读写叙事文件', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-story-'));
  const store = createStoryStore({ root: dir });
  store.ensure('private:1', card);
  store.writeSection('private:1', 'now', '# 此刻\n\n有点想问，但先不追问。', card);
  store.addEpisode('private:1', '他第一次说累', '# 他第一次说累\n\n他说今天有点累，没有展开。', card);
  const story = store.read('private:1', card);
  assert.match(story.self, /小鲸鱼/);
  assert.match(story.now, /先不追问/);
  assert.equal(story.episodes.length, 1);
  assert.match(store.dirOf('private:1'), /private_1/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('U 型：人设在前，此刻和刚才在后', () => {
  const story = {
    self: '# 我\n\n我是小鲸鱼。',
    relationship: '# 我们\n\n还不熟。',
    now: '# 此刻\n\n没什么特别想的，先听他说。',
    episodes: [{ text: '# 一件小事\n\n他上次说累。' }]
  };
  const prompt = buildNarrativePrompt({
    card,
    story,
    turns: [{ role: 'user', text: '今天好累' }],
    intent: '接一句',
    maxChars: 1200
  });
  assert.match(prompt.system, /【稳定的我】/);
  assert.match(prompt.user, /他上次说累/);
  assert.ok(prompt.user.indexOf('他上次说累') < prompt.user.indexOf('今天好累'));
  assert.ok(prompt.user.indexOf('今天好累') < prompt.user.indexOf('【这一轮】'));
  assert.ok(prompt.user.indexOf('先听他说') < prompt.user.indexOf('【这一轮】'));
  assert.ok(prompt.chars <= 1200);
  assert.doesNotMatch(prompt.system + prompt.user, /好感度|等级|概率|score|level/);
});

test('长上下文先砍中间，不丢头尾', () => {
  const prompt = buildNarrativePrompt({
    card,
    story: {
      self: '# 我\n\n小鲸鱼',
      relationship: '# 我们\n\n熟了一点。',
      now: '# 此刻\n\n先接住。',
      episodes: [{ text: '很长的往事。'.repeat(200) }]
    },
    turns: Array.from({ length: 3 }, (_, i) => ({ role: 'user', text: `第${i}句` })),
    maxChars: 900
  });
  assert.ok(prompt.chars <= 900);
  assert.match(prompt.system, /小鲸鱼/);
  assert.match(prompt.user, /先接住/);
});
