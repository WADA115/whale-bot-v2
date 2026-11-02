import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeReply } from '../src/core/reply.js';

test('保留她自己写下的换行', () => {
  assert.equal(sanitizeReply('第一句\n第二句'), '第一句\n第二句');
});

test('行内多余空白仍然收掉', () => {
  assert.equal(sanitizeReply('第一句    第二句'), '第一句 第二句');
});
