import assert from 'node:assert/strict';
import test from 'node:test';
import { createLiveGroup } from '../src/runtime/live-group.js';

test('群消息只存原话，等她要时再取', () => {
  const live = createLiveGroup();
  live.observe({ kind: 'group', key: 'group:1', groupName: '测试群', senderName: '甲', text: '今天好累' });
  live.observe({ kind: 'group', key: 'group:1', senderName: '乙', text: '早点睡' });
  assert.deepEqual(live.recent('group:1'), ['甲：今天好累', '乙：早点睡']);
  assert.deepEqual(live.recent('group:2'), []);
  assert.equal(live.name('group:1'), '测试群');
});

test('私聊不进群记录', () => {
  const live = createLiveGroup();
  live.observe({ kind: 'private', key: 'private:1', text: '在吗' });
  assert.deepEqual(live.recent('private:1'), []);
});
