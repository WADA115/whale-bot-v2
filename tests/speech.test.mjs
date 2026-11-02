import assert from 'node:assert/strict';
import test from 'node:test';
import { splitBubbles } from '../src/runtime/speech.js';

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
