import test from 'node:test';
import assert from 'node:assert/strict';
import { selectCurrentMessage } from '../src/runtime/actor-inbound.js';

test('入站选择会跳过已经 ack 的任务，保留普通消息', async () => {
  const queued = [];
  const msg = { kind: 'private', id: '1', userId: '1', text: '在吗', senderName: '主人' };
  const current = await selectCurrentMessage({
    batch: [msg],
    key: 'private:1',
    tasks: { add: (x) => queued.push(x) },
    taskExecutor: { runPending: async () => {} },
    character: { director: { observe: () => ({ respond: true }) } },
    config: { mode: 'live', character: {} },
    gateway: { sendText: async () => {} },
    logger: { info() {}, warn() {} }
  });
  assert.equal(current, msg);
  assert.equal(queued.length, 0);
});
