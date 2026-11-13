import test from 'node:test';
import assert from 'node:assert/strict';
import { routeIncoming } from '../src/character/ingress.js';

test('任务/命令不进角色', () => {
  assert.equal(routeIncoming('帮我写个周报').kind, 'task');
  assert.equal(routeIncoming('查一下明天的天气').kind, 'task');
  assert.equal(routeIncoming('/status').kind, 'social');
  assert.equal(routeIncoming('这个总结写得一般').kind, 'social');
  assert.equal(routeIncoming('我代码跑通了').kind, 'social');
  assert.equal(routeIncoming('今天写文档累死了').kind, 'social');
  assert.equal(routeIncoming('帮我总结一下这个文档').kind, 'task');
  assert.equal(routeIncoming('在吗').kind, 'social');
  assert.equal(routeIncoming('我喜欢冰美式').kind, 'social');
});
