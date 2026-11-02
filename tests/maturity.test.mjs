import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createStoryStore } from '../src/story/store.js';
import { buildCharacterPrompt } from '../src/character/actor.js';
import { buildNarrativePrompt } from '../src/story/prompt.js';

const card = {
  name: '小鲸鱼',
  identity: '鱼',
  voice: ['短句'],
  values: ['被当成人'],
  boundaries: ['不刷屏'],
  maturity: ['可爱是外观，不是心智', '可以生气，但不操控']
};

test('self.md 写入心理成熟', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maturity-'));
  const store = createStoryStore({ root });
  store.ensure('private:1', card);
  const story = store.read('private:1');
  assert.match(story.self, /心理成熟/);
  assert.match(story.self, /可爱是外观/);
});

test('叙事 prompt 带心理成熟', () => {
  const prompt = buildNarrativePrompt({
    card,
    story: { self: '## 心理成熟\n- 可爱是外观', relationship: '不熟', now: '在听' },
    turns: []
  });
  assert.match(prompt.system, /心理成熟/);
  assert.match(prompt.system, /可爱是外观/);
  assert.match(prompt.system, /不要用括号/);
});

test('旧角色 prompt 也带心理成熟', () => {
  const prompt = buildCharacterPrompt({ card });
  assert.match(prompt.user, /心理成熟/);
  assert.match(prompt.user, /可以生气/);
});
