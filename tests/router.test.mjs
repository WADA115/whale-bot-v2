import test from 'node:test';
import assert from 'node:assert/strict';
import { createModelRouter, stripThink } from '../src/core/router.js';

test('stripThink 去思考段', () => {
  assert.equal(stripThink('<think>abc</think>你好'), '你好');
  assert.equal(stripThink('<think>未闭合\n内容'), '');
  assert.equal(stripThink('正常'), '正常');
});

test('router 第一路失败后降级', async () => {
  let calls = 0;
  const fetchImpl = async (url) => {
    calls += 1;
    if (url.includes('127.0.0.1:1/')) {
      return { ok: false, status: 500, text: async () => 'boom' };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ message: { content: '<think>x</think>本地回复' } })
    };
  };
  const router = createModelRouter({
    providers: [
      { id: 'a', type: 'openai', baseURL: 'http://127.0.0.1:1/v1', model: 'x', apiKey: 'k', timeoutMs: 100 },
      { id: 'b', type: 'ollama', baseURL: 'http://local', model: 'qwen3:4b', timeoutMs: 100 }
    ],
    fetchImpl
  });
  const out = await router.generate({ system: 's', user: 'u' });
  assert.equal(out.provider, 'b');
  assert.equal(out.text, '本地回复');
  assert.equal(calls, 2);
});

test('router 空回复继续降级', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('local:1')) {
      return { ok: true, status: 200, json: async () => ({ message: { content: '' } }) };
    }
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '好的' } }] }) };
  };
  const router = createModelRouter({
    providers: [
      { id: 'a', type: 'ollama', baseURL: 'http://local:1', model: 'x', timeoutMs: 100 },
      { id: 'b', type: 'openai', baseURL: 'http://remote', model: 'y', apiKey: 'k', timeoutMs: 100 }
    ],
    fetchImpl
  });
  const out = await router.generate({ user: 'u' });
  assert.equal(out.provider, 'b');
  assert.equal(out.text, '好的');
});
