import test from 'node:test';
import assert from 'node:assert/strict';
import { createVisionRouter } from '../src/core/vision.js';

test('vision 下载图片并调用第一个可用 provider', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).startsWith('https://img.example/')) {
      return {
        ok: true,
        headers: new Headers({ 'content-type': 'image/png' }),
        arrayBuffer: async () => Buffer.from('fake-image-bytes')
      };
    }
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: '<think>x</think>画面：一只鲸鱼\n文字：无\n判断：高' } }] })
    };
  };
  const router = createVisionRouter({
    providers: [{ id: 'p', type: 'openai', baseURL: 'https://api.example/v1', model: 'm', apiKey: 'k' }],
    fetchImpl
  });
  const out = await router.describe({
    message: { segments: [{ type: 'image', data: { url: 'https://img.example/a.png' } }] }
  });
  assert.equal(out.provider, 'p');
  assert.match(out.text, /画面：一只鲸鱼/);
  assert.equal(calls.length, 2);
});
