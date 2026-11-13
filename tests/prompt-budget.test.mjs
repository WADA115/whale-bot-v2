import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNarrativePrompt } from '../src/story/prompt.js';

test('预算小到中间层为 0 时不把长素材整段塞进 prompt', () => {
  const prompt = buildNarrativePrompt({
    card: { name: '小鲸鱼', identity: '鱼' },
    story: { self: '# 我\n\n鱼', relationship: '', now: '', episodes: [{ text: 'X'.repeat(8000) }] },
    turns: [{ role: 'user', text: '在吗' }],
    maxChars: 100
  });
  assert.ok(!prompt.user.includes('X'.repeat(1000)));
});

test('prompt 的 user 长度受预算约束', () => {
  const prompt = buildNarrativePrompt({
    card: { name: '小鲸鱼', identity: '鱼' },
    story: { self: '# 我\n\n鱼', relationship: '', now: '', episodes: [{ text: 'Y'.repeat(8000) }] },
    turns: [{ role: 'user', text: '在吗' }],
    maxChars: 1200
  });
  assert.ok(prompt.user.length <= 1200, `user length ${prompt.user.length}`);
});
