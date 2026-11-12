import test from 'node:test';
import assert from 'node:assert/strict';
import { createActorTurn } from '../src/runtime/actor-turn.js';

test('actor onTurn 能走到拼 prompt 和发送', async () => {
  const logs = [];
  const sent = [];
  const config = { mode: 'live', allow: { private: ['1'], groups: [] }, character: {}, actor: {} };
  const card = { name: '测试', identity: '测试角色', voice: [], views: [], taste: [], line: [], world: [], boundaries: [], drive: '' };
  const story = { self: '# 我\n\n测试', relationship: '# 我们', now: '# 此刻\n\n在听', episodes: [] };
  const character = {
    card,
    director: { observe: () => ({ respond: true }), recordReply: () => {} },
    scenes: { get: () => ({ turns: [{ role: 'user', text: '在吗' }] }) },
    groupCooldownMs: 0
  };
  const onTurn = createActorTurn({
    config,
    character,
    storyStore: { read: () => story, readPerson: () => null },
    storyEditor: null,
    textRouter: { generate: async () => ({ text: '在。', provider: 'stub' }) },
    autonomy: { touch() {} },
    storyAgency: { touch() {} },
    tasks: { add: () => ({ id: 't1' }) },
    taskExecutor: { runPending: async () => {} },
    visionRouter: null,
    screen: null,
    asr: null,
    tts: null,
    rvc: null,
    mansui: null,
    permissions: null,
    conversationLog: null,
    contacts: null,
    moments: null,
    diary: null,
    milestones: null,
    memorySummary: null,
    visionLimiter: null,
    asrLimiter: null,
    rvcLimiter: null,
    draw: null,
    sing: null,
    mind: null,
    knowledge: null,
    slang: [],
    stickers: [],
    gateway: {
      selfId: '0',
      sendText: async (_kind, _id, text) => { sent.push(text); },
      sendMessage: async () => {}
    },
    logger: {
      info: (event) => logs.push(event),
      warn: () => {},
      error: () => {}
    },
    groupCooldowns: new Map(),
    expressionCooldowns: new Map(),
    stats: { sent: 0, imageCount: 0 },
    metrics: { inc() {}, observe() {} },
    inboundSeq: new Map(),
    liveGroup: null,
    bilibili: null,
    callModels: true
  });
  await onTurn('private:1', [{ kind: 'private', id: '1', userId: '1', text: '在吗', images: [], voices: [], at: [] }]);
  assert.ok(logs.includes('character.actor_prompt'));
  assert.deepEqual(sent, ['在。']);
});
