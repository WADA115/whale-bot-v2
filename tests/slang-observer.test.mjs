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
  const observer = createSlangObserver({
    file,
    entries,
    textRouter: {
      generate: async () => ({ text: '[{"term":"绷不住了","meaning":"忍不住笑或崩溃","usage":"看到离谱的东西时说"}]' })
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
