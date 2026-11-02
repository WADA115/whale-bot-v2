import assert from 'node:assert/strict';
import test from 'node:test';
import { createGroupContext } from '../src/runtime/group-context.js';

test('群消息即使不接，也留在上下文里', () => {
  const context = createGroupContext({ limit: 5 });
  context.observe({ kind: 'group', key: 'group:1', messageId: '1', senderName: '甲', text: '今天好累' });
  context.observe({ kind: 'group', key: 'group:1', messageId: '2', senderName: '乙', text: '早点睡' });
  const text = context.format('group:1', '2');
  assert.match(text, /今天好累/);
  assert.doesNotMatch(text, /早点睡/);
});

test('私聊不进入群上下文', () => {
  const context = createGroupContext();
  context.observe({ kind: 'private', key: 'private:1', messageId: '1', text: '在吗' });
  assert.equal(context.format('private:1'), '');
});
