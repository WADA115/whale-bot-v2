import test from 'node:test';
import assert from 'node:assert/strict';
import { createActorTurn } from '../src/runtime/actor-turn.js';

function setup({ textRouter = null, config: configOverride = {}, message = null, visionRouter = null, contacts = null } = {}) {
  const logs = [];
  const sent = [];
  const writes = [];
  const config = {
    mode: 'live',
    allow: { private: ['1'], groups: ['2'] },
    character: {},
    actor: {},
    ...configOverride
  };
  const card = { name: '测试', identity: '测试角色', voice: [], views: [], taste: [], line: [], world: [], boundaries: [], drive: '' };
  const story = { self: '# 我\n\n测试', relationship: '# 我们', now: '# 此刻\n\n在听', episodes: [] };
  const character = {
    card,
    director: { observe: () => ({ respond: true }), recordReply: () => {} },
    scenes: { get: () => ({ turns: [{ role: 'user', text: '在吗' }] }) },
    groupCooldownMs: 0
  };
  const diary = { add: (entry) => writes.push(entry), list: () => [] };
  const onTurn = createActorTurn({
    config,
    character,
    storyStore: { read: () => story, readPerson: () => null },
    storyEditor: null,
    textRouter: textRouter || { generate: async () => ({ text: '在。', provider: 'stub' }) },
    autonomy: { touch() {} },
    storyAgency: { touch() {} },
    tasks: { add: () => ({ id: 't1' }) },
    taskExecutor: { runPending: async () => {} },
    visionRouter,
    screen: null,
    asr: null,
    tts: null,
    rvc: null,
    mansui: null,
    permissions: null,
    conversationLog: null,
    contacts,
    moments: null,
    diary,
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
    gateway: { selfId: '0', sendText: async (_kind, _id, text) => { sent.push(text); }, sendMessage: async () => {} },
    logger: { info: (event) => logs.push(event), warn: () => {}, error: () => {} },
    groupCooldowns: new Map(),
    expressionCooldowns: new Map(),
    stats: { sent: 0, imageCount: 0 },
    metrics: { inc() {}, observe() {} },
    inboundSeq: new Map(),
    liveGroup: null,
    bilibili: null,
    callModels: true
  });
  return {
    run: () => onTurn('private:1', [message || { kind: 'private', id: '1', userId: '1', text: '在吗', images: [], voices: [], at: [] }]),
    logs,
    sent,
    writes
  };
}

test('actor onTurn 能走到拼 prompt 和发送', async () => {
  const h = setup();
  await h.run();
  assert.ok(h.logs.includes('character.actor_prompt'));
  assert.deepEqual(h.sent, ['在。']);
});

test('actor onTurn 群聊也能走到发送', async () => {
  const h = setup({
    message: { kind: 'group', id: '2', userId: '1', text: '在吗', images: [], voices: [], at: [] }
  });
  await h.run();
  assert.ok(h.logs.includes('character.actor_prompt'));
  assert.deepEqual(h.sent, ['在。']);
});

test('actor 工具调用能执行并回到模型', async () => {
  let toolRan = false;
  const h = setup({
    textRouter: {
      generateWithTools: async ({ execute }) => {
        await execute('write_diary', { text: '留一笔' });
        toolRan = true;
        return { text: '写好了。', provider: 'stub' };
      }
    }
  });
  await h.run();
  assert.equal(toolRan, true);
  assert.equal(h.writes[0].text, '留一笔');
  assert.ok(h.logs.includes('character.actor_prompt'));
});

test('actor 图片会先走视觉再进入回合', async () => {
  const h = setup({
    config: { vision: { enabled: true } },
    visionRouter: { describe: async () => ({ text: '一张图', provider: 'stub' }) },
    message: {
      kind: 'private', id: '1', userId: '1', text: '看这个', at: [],
      images: [{ url: 'https://example.invalid/a.png' }], voices: []
    }
  });
  await h.run();
  assert.ok(h.logs.includes('character.actor_prompt'));
  assert.deepEqual(h.sent, ['在。']);
});

test('actor 工具错误不会打断主回复', async () => {
  const h = setup({
    contacts: { forget: () => false },
    textRouter: {
      generateWithTools: async ({ execute }) => {
        const result = await execute('forget_memory', { person: 'nobody', text: 'x' });
        assert.equal(result.ok, false);
        return { text: '没找到。', provider: 'stub' };
      }
    }
  });
  await h.run();
  assert.ok(h.logs.includes('character.actor_prompt'));
  assert.deepEqual(h.sent, ['没找到。']);
});