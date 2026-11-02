import assert from 'node:assert/strict';
import test from 'node:test';
import { OneBotGateway } from '../../src/gateway/onebot.js';
import { startMockOneBot } from './mock-onebot.mjs';

function waitEvent(emitter, event, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting ${event}`)), timeoutMs);
    emitter.once(event, (value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

test('OneBot 模拟联调：登录、收消息、发消息', async () => {
  const mock = await startMockOneBot();
  const gateway = new OneBotGateway({
    httpUrl: `http://127.0.0.1:${mock.port}`,
    wsUrl: `ws://127.0.0.1:${mock.port}/`,
    reconnectMs: 50
  });

  try {
    const readyPromise = waitEvent(gateway, 'ready');
    gateway.connect();
    const ready = await readyPromise;
    assert.equal(ready.id, '10001');
    assert.equal(ready.nickname, '测试鱼');

    const messagePromise = waitEvent(gateway, 'message');
    mock.sendMessage({
      message_type: 'private',
      self_id: 10001,
      user_id: 20002,
      message_id: 3,
      sender: { user_id: 20002, nickname: '用户' },
      message: [
        { type: 'text', data: { text: '在吗' } },
        { type: 'image', data: { url: 'https://example.com/a.png' } }
      ]
    });
    const payload = await messagePromise;
    const normalized = gateway.normalize(payload);
    assert.equal(normalized.key, 'private:20002');
    assert.equal(normalized.text, '在吗');
    assert.equal(normalized.images.length, 1);

    await gateway.sendText('private', '20002', '在的');
    const sent = mock.calls.find((call) => call.action === 'send_private_msg');
    assert.equal(sent.params.user_id, '20002');
    assert.equal(sent.params.message[0].data.text, '在的');
  } finally {
    gateway.close();
    await mock.close();
  }
});

test('OneBot 模拟联调：群消息 @ 规范化', async () => {
  const mock = await startMockOneBot();
  const gateway = new OneBotGateway({
    httpUrl: `http://127.0.0.1:${mock.port}`,
    wsUrl: `ws://127.0.0.1:${mock.port}/`,
    reconnectMs: 50
  });

  try {
    const readyPromise = waitEvent(gateway, 'ready');
    gateway.connect();
    await readyPromise;

    const messagePromise = waitEvent(gateway, 'message');
    mock.sendMessage({
      message_type: 'group',
      self_id: 10001,
      group_id: 30003,
      user_id: 20002,
      message_id: 4,
      sender: { user_id: 20002, card: '甲' },
      message: [
        { type: 'at', data: { qq: '10001' } },
        { type: 'text', data: { text: ' 在吗 ' } }
      ]
    });
    const payload = await messagePromise;
    const normalized = gateway.normalize(payload);
    assert.equal(normalized.key, 'group:30003');
    assert.equal(normalized.text, '在吗');
    assert.deepEqual(normalized.at, ['10001']);
  } finally {
    gateway.close();
    await mock.close();
  }
});
