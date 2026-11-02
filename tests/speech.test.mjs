import assert from 'node:assert/strict';
import test from 'node:test';
import { splitBubbles, replyPause, bubblePause } from '../src/runtime/speech.js';

test('短句不拆气泡', () => {
  assert.deepEqual(splitBubbles('在，咋了'), ['在，咋了']);
});

test('长回复按句子拆成有限气泡', () => {
  const text = '在。刚看到消息。刚才在忙别的。你那边怎么样了？';
  const bubbles = splitBubbles(text);
  assert.ok(bubbles.length >= 1 && bubbles.length <= 3);
  assert.equal(bubbles.join(''), text);
});

test('停顿不是固定值，群聊略短', () => {
  const a = replyPause('在吗', 'private');
  const b = replyPause('在吗', 'private');
  assert.equal(a, b);
  assert.ok(a > 0);
  assert.ok(replyPause('在吗', 'group') < a);
  assert.ok(bubblePause('一句话') > 0);
});
