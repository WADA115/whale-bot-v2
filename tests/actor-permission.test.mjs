import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolExecutor } from '../src/runtime/actor-executor.js';

function executor() {
  const requests = [];
  const messages = [];
  const permissions = {
    request: (payload) => { requests.push(payload); return { id: 'P1' }; }
  };
  const gateway = {
    sendMessage: async (kind, id, segments) => { messages.push({ kind, id, text: segments?.[0]?.data?.text }); }
  };
  const execute = createToolExecutor({
    lookAtGroups: async () => '',
    runKnowledge: async () => '',
    config: { allow: { private: ['1'] } },
    gateway,
    moments: null,
    milestones: null,
    current: { kind: 'group', id: 'g1', userId: 'u1', senderName: '群友' },
    screen: null,
    visionRouter: null,
    logger: { info() {}, warn() {} },
    key: 'group:g1',
    diaryEntries: [],
    diary: null,
    contacts: null,
    permissions,
    mansui: null,
    tts: null,
    rvc: null,
    rvcLimiter: null,
    runDraw: async () => null,
    runSing: async () => null,
    bilibili: null,
    mind: null,
    writeGate: { consume: () => false }
  });
  return { execute, requests, messages };
}

test('权限请求只发送模型生成的 ask，不拼固定模板', async () => {
  const h = executor();
  const result = await h.execute('request_permission', { what: '骂人', why: '被冒犯', ask: '我想骂回去，行不行' });
  assert.deepEqual(result, { ok: true, action: 'asked' });
  assert.equal(h.requests.length, 1);
  assert.deepEqual(h.messages.map((x) => x.text), ['我想骂回去，行不行', '我想骂回去，行不行']);
  assert.ok(h.messages.every((x) => x.text === '我想骂回去，行不行'));
});

test('没有 ask 时不发送权限请求', async () => {
  const h = executor();
  const result = await h.execute('request_permission', { what: '骂人', why: '被冒犯' });
  assert.deepEqual(result, { ok: false, action: 'missing_ask' });
  assert.equal(h.requests.length, 0);
  assert.equal(h.messages.length, 0);
});
