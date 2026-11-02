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
  maturity: ['可爱是外观，不是心智']
};

test('self.md 不把成熟写成检查表', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wide-'));
  const store = createStoryStore({ root });
  store.ensure('private:1', card);
  const story = store.read('private:1');
  assert.doesNotMatch(story.self, /心理成熟/);
  assert.match(story.self, /鱼/);
});

test('prompt 直接是她，不是扮演她', () => {
  const prompt = buildNarrativePrompt({
    card,
    story: { self: '我是鱼', relationship: '不熟', now: '在听' },
    turns: []
  });
  assert.match(prompt.system, /你是小鲸鱼/);
  assert.doesNotMatch(prompt.system, /你在扮演/);
  assert.doesNotMatch(prompt.system, /心理成熟/);
});

test('旧角色 prompt 也不再塞成熟清单', () => {
  const prompt = buildCharacterPrompt({ card });
  assert.doesNotMatch(prompt.user, /心理成熟/);
});
