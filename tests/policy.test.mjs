import test from 'node:test';
import assert from 'node:assert/strict';
import { decide, isAllowed } from '../src/core/policy.js';

const config = {
  allow: { groups: ['g1'], private: ['u1'] },
  role: { name: '小鲸鱼', aliases: ['鱼鱼'], groupTrigger: 'mention', otherBots: ['小鲸鱼'] }
};
const base = {
  kind: 'group', id: 'g1', userId: 'u2', selfId: '999', text: '你好', at: [], segments: [], senderName: '乙'
};

test('白名单', () => {
  assert.equal(isAllowed({ kind: 'group', id: 'g1', allow: config.allow }), true);
  assert.equal(isAllowed({ kind: 'group', id: 'g2', allow: config.allow }), false);
  assert.equal(isAllowed({ kind: 'private', id: 'u1', allow: config.allow }), true);
});

test('私聊直接接', () => {
  assert.equal(decide({ message: { ...base, kind: 'private', id: 'u1' }, config, selfId: '999' }).handle, true);
});

test('群聊未点名不接', () => {
  assert.equal(decide({ message: base, config, selfId: '999' }).handle, false);
});

test('群聊 @ 接', () => {
  const message = { ...base, at: ['999'] };
  assert.equal(decide({ message, config, selfId: '999' }).reason, 'addressed');
});

test('群聊叫名字接', () => {
  const message = { ...base, text: '鱼鱼在吗' };
  assert.equal(decide({ message, config, selfId: '999' }).handle, true);
});

test('自己消息不接', () => {
  const message = { ...base, userId: '999', selfId: '999' };
  assert.equal(decide({ message, config, selfId: '999' }).reason, 'self');
});

test('非白名单不接', () => {
  const message = { ...base, id: 'g2', at: ['999'] };
  assert.equal(decide({ message, config, selfId: '999' }).reason, 'not-allowed');
});

test('图片 @ 接', () => {
  const message = { ...base, text: '', at: ['999'], images: ['https://img/x.jpg'] };
  assert.equal(decide({ message, config, selfId: '999' }).reason, 'addressed-image');
});

test('其他 bot 不接', () => {
  const message = { ...base, senderName: '小鲸鱼', at: ['999'], text: '在吗' };
  assert.equal(decide({ message, config, selfId: '999' }).reason, 'other-bot');
});
