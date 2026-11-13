import assert from 'node:assert/strict';
import test from 'node:test';
import { splitBubbles, sendHumanReply } from '../src/runtime/speech.js';

test('没有换行就是一条', () => {
  assert.deepEqual(splitBubbles('在，咋了'), ['在，咋了']);
});

test('她写下的换行就是节奏', () => {
  assert.deepEqual(splitBubbles('在。\n刚看到消息。\n你那边怎么样？'), [
    '在。',
    '刚看到消息。',
    '你那边怎么样？'
  ]);
});

test('空文本不发送', () => {
  assert.deepEqual(splitBubbles('   '), []);
});
test('说到一半被新消息打断，剩余气泡不再发', async () => {
  const sent = [];
  let count = 0;
  const delivery = await sendHumanReply({
    gateway: { sendText: async (kind, id, text) => { sent.push(text); count += 1; } },
    kind: 'private',
    id: '1',
    text: '第一句\n第二句\n第三句',
    timing: false,
    interrupted: () => count > 0
  });
  assert.deepEqual(sent, ['第一句']);
  assert.equal(delivery.interrupted, true);
  assert.equal(delivery.deliveredText, '第一句');
});
test('表情主路径和 fallback 都失败时，文字仍算送达', async () => {
  const sent = [];
  const delivery = await sendHumanReply({
    gateway: {
      sendText: async (_kind, _id, text) => { sent.push(text); },
      sendMessage: async () => { throw new Error('sticker down'); }
    },
    kind: 'private',
    id: '1',
    text: '先回一句。',
    sticker: { md5: 'a'.repeat(32), desc: '表情' },
    timing: false
  });
  assert.deepEqual(sent, ['先回一句。']);
  assert.equal(delivery.stickerSent, false);
});