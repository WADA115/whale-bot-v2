import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolExecutor } from '../src/runtime/actor-executor.js';

test('actor 工具执行器仍能写日记和忘记记忆', async () => {
  const writes = [];
  const forgotten = [];
  const execute = createToolExecutor({
    lookAtGroups: async () => '群记录',
    runKnowledge: async () => '资料',
    config: { allow: { private: ['1'] } },
    gateway: { sendMessage: async () => {} },
    moments: { add() {} },
    milestones: { add() {} },
    current: { kind: 'private', id: '1', userId: '1', senderName: '主人' },
    screen: null,
    visionRouter: null,
    logger: { info() {}, warn() {} },
    key: 'private:1',
    diaryEntries: [{ date: '2026-11-12', text: '今天的事' }],
    diary: { add: (entry) => writes.push(entry) },
    contacts: { forget: (query) => { forgotten.push(query); return true; } },
    permissions: { request: () => ({ id: 'p1' }) },
    mansui: null,
    tts: null,
    rvc: null,
    rvcLimiter: null,
    runDraw: async () => '画',
    runSing: async () => '唱',
    bilibili: null,
    mind: null,
    writeGate: { consume: () => false }
  });
  assert.equal((await execute('write_diary', { text: '留一笔' })).action, 'saved');
  assert.equal(writes[0].text, '留一笔');
  assert.equal((await execute('forget_memory', { person: '2', text: '忘了' })).action, 'forgotten');
  assert.equal(forgotten[0].id, '2');
  assert.match(await execute('read_diary', { query: '今天' }), /今天的事/);
});
