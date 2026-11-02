import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldReflect } from '../src/story/reflect.js';

test('普通闲聊不触发复盘', () => {
  assert.equal(shouldReflect({ text: '在吗' }), false);
  assert.equal(shouldReflect({ text: '来来来' }), false);
  assert.equal(shouldReflect({ text: '😁' }), false);
});

test('纠正、命名、承诺和图片才值得留下', () => {
  assert.equal(shouldReflect({ text: '你记错了，我叫张三' }), true);
  assert.equal(shouldReflect({ text: '以后不要带鲸鱼了' }), true);
  assert.equal(shouldReflect({ text: '我答应你下次早点睡' }), true);
  assert.equal(shouldReflect({ imageDesc: '一张图' }), true);
  assert.equal(shouldReflect({ notices: ['[事实确认：对方确认了之前说过的事]'] }), true);
});
