import test from 'node:test';
import assert from 'node:assert/strict';
import { deliverActorReply } from '../src/runtime/actor-reply.js';

test('actor 回复在 dryRun 下只记录不发送', async () => {
  let recorded = '';
  await deliverActorReply({
    config: { mode: 'live', character: { expression: { enabled: false } } },
    current: { dryRun: true, kind: 'private', id: '1' },
    character: { director: { recordReply: (_key, text) => { recorded = text; } } },
    text: '测试',
    stickers: [],
    expressionCooldowns: new Map(),
    logger: { info() {}, warn() {} },
    key: 'private:1',
    stats: { sent: 0 },
    metrics: { inc() {}, observe() {} },
    startedAt: Date.now(),
    gateway: { sendMessage: async () => { throw new Error('should not send'); } },
    reply: '只记录',
    interrupted: () => false,
    storyEditor: null,
    story: null,
    notices: [],
    enqueueEditor: null,
    personId: '',
    scene: { turns: [] },
    imageDesc: '',
    voiceDesc: '',
    groupCooldowns: new Map(),
    provider: 'test'
  });
  assert.equal(recorded, '只记录');
});
