import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSlangObserver } from '../src/character/slang-observer.js';

test('群聊黑话观察器会从群消息里提取候选', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slang-observer-'));
  const file = path.join(dir, 'slang.json');
  const entries = [];
  let calls = 0;
  const observer = createSlangObserver({
    file,
    entries,
    search: async () => [{ title: '绷不住了是什么梗', snippet: '绷不住了，网络用语，指忍不住笑或崩溃。', url: 'https://example.com/beng' }],
    textRouter: {
      generate: async () => {
        calls += 1;
        if (calls === 1) return { text: '[{"term":"绷不住了","meaning":"忍不住笑或崩溃","usage":"看到离谱的东西时说"}]' };
        return { text: '{"meaning":"忍不住笑或崩溃","usage":"看到离谱的东西时说","worth":true}' };
      }
    },
    config: { batchSize: 5, intervalMs: 60_000 }
  });
  for (let i = 0; i < 5; i += 1) {
    observer.observe({
      kind: 'group',
      key: 'group:1',
      id: '1',
      senderName: '群友',
      text: i === 0 ? '这个真绷不住了' : '哈哈'
    });
  }
  await observer.flush();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].term, '绷不住了');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).length, 1);
});
test('图片和表情包会先过视觉再进黑话提取', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slang-image-'));
  const entries = [];
  let calls = 0;
  const observer = createSlangObserver({
    file: path.join(dir, 'slang.json'),
    entries,
    search: async () => [{ title: '大肥鱼是什么梗', snippet: '大肥鱼，指蓝色鲸鱼娘。', url: 'https://example.com/fish' }],
    vision: { describe: async () => ({ text: '文字：大肥鱼' }) },
    textRouter: {
      generate: async () => {
        calls += 1;
        if (calls === 1) return { text: '[{"term":"大肥鱼","meaning":"蓝色鲸鱼娘","usage":"叫小鲸鱼时"}]' };
        return { text: '{"meaning":"蓝色鲸鱼娘","usage":"叫小鲸鱼时","worth":true}' };
      }
    },
    config: { batchSize: 5, intervalMs: 60_000 }
  });
  observer.observe({
    kind: 'group',
    key: 'group:1',
    id: '1',
    senderName: '群友',
    text: '',
    segments: [{ type: 'image', data: { url: 'https://example.com/a.gif' } }],
    images: [{ url: 'https://example.com/a.gif' }]
  });
  await observer.flush();
  assert.equal(entries[0]?.term, '大肥鱼');
});
test('黑话提取模型卡住时按 timeout 返回', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slang-timeout-'));
  const observer = createSlangObserver({
    file: path.join(dir, 'slang.json'),
    entries: [],
    search: async () => [],
    textRouter: { generate: () => new Promise(() => {}) },
    config: { batchSize: 5, intervalMs: 60_000, timeoutMs: 1000 }
  });
  for (let i = 0; i < 5; i += 1) {
    observer.observe({ kind: 'group', key: 'group:1', id: '1', senderName: '群友', text: `卡住测试${i}` });
  }
  const started = Date.now();
  await observer.flush();
  assert.ok(Date.now() - started < 4000);
});