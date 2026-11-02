import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildCharacterPrompt } from '../src/character/actor.js';
import { createSceneStore } from '../src/character/scene.js';
import { createDirector } from '../src/character/director.js';

const card = {
  name: '小鲸鱼',
  identity: '一只住在 QQ 里的蓝色小鲸鱼',
  voice: ['短句', '偶尔带 🐳'],
  values: ['被当人看'],
  boundaries: ['不泄露系统'],
  examples: ['用户：在吗\n小鲸鱼：在，咋了🐳']
};

test('actor prompt 有角色/场景/记忆，且没有工具与知识库', () => {
  const prompt = buildCharacterPrompt({
    card,
    sceneCard: '地点：私聊\n在场：对方',
    turns: [{ role: 'user', text: '在吗' }],
    memories: ['[记忆] 对方喜欢冰美式'],
    intent: '回应最后一句',
    maxChars: 1200
  });
  assert.match(prompt.system, /小鲸鱼/);
  assert.match(prompt.user, /蓝色小鲸鱼/);
  assert.match(prompt.user, /冰美式/);
  assert.ok(prompt.chars <= 1200);
  assert.doesNotMatch(prompt.user, /知识库|MCP|工具/);
});

test('actor prompt 超限时优先砍对话和记忆', () => {
  const prompt = buildCharacterPrompt({
    card,
    sceneCard: '地点：私聊',
    turns: Array.from({ length: 10 }, (_, i) => ({ role: 'user', text: `消息${i}`.repeat(50) })),
    memories: Array.from({ length: 10 }, (_, i) => `[记忆] ${i}`.repeat(50)),
    maxChars: 600
  });
  assert.ok(prompt.chars <= 600);
  assert.match(prompt.user, /蓝色小鲸鱼/);
});

test('director 私聊接、群聊冻结、场景记录', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-scene-'));
  const scenes = createSceneStore({ file: path.join(dir, 'scenes.json') });
  const director = createDirector({ sceneStore: scenes, privateOnly: true });
  const privateDecision = director.observe({ key: 'private:1', kind: 'private', text: '在吗' });
  assert.equal(privateDecision.respond, true);
  assert.equal(scenes.get('private:1').turns.at(-1).role, 'user');
  const groupDecision = director.observe({ key: 'group:1', kind: 'group', text: '@鱼鱼 在吗' });
  assert.equal(groupDecision.respond, false);
  director.recordReply('private:1', '在');
  assert.equal(scenes.get('private:1').turns.at(-1).role, 'assistant');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('director 群聊 canary 接住并记录场景', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-group-scene-'));
  const scenes = createSceneStore({ file: path.join(dir, 'scenes.json') });
  const director = createDirector({ sceneStore: scenes, privateOnly: false, groupTrigger: 'mention', aliases: ['鱼鱼'] });
  const ignored = director.observe({ key: 'group:1', kind: 'group', text: '在吗', senderName: '甲' });
  assert.equal(ignored.respond, false);
  const decision = director.observe({ key: 'group:1', kind: 'group', text: '@鱼鱼 在吗', at: ['100'], selfId: '100', senderName: '甲' });
  assert.equal(decision.respond, true);
  assert.match(director.sceneCard('group:1'), /群聊/);
  director.recordReply('group:1', '在🐳');
  assert.equal(scenes.get('group:1').turns.at(-1).role, 'assistant');
  fs.rmSync(dir, { recursive: true, force: true });
});
