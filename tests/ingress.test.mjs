import test from 'node:test';
import assert from 'node:assert/strict';
import { routeIncoming } from '../src/character/ingress.js';

test('任务/命令不进角色', () => {
  assert.equal(routeIncoming('帮我写个周报').kind, 'task');
  assert.equal(routeIncoming('查一下明天的天气').kind, 'task');
  assert.equal(routeIncoming('/status').kind, 'command');
  assert.equal(routeIncoming('在吗').kind, 'social');
  assert.equal(routeIncoming('我喜欢冰美式').kind, 'social');
});
