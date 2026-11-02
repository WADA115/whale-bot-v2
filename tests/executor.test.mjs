import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTaskInbox } from '../src/character/tasks.js';
import { createTaskExecutor } from '../src/character/executor.js';

test('任务执行器写结果并跳过搜索', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-exec-'));
  const outDir = path.join(dir, 'results');
  const inbox = createTaskInbox({ file: path.join(dir, 'tasks.json') });
  const calls = [];
  const router = {
    async generate({ system, user }) {
      calls.push({ system, user });
      return { text: '这是任务结果。', provider: 'mock' };
    }
  };
  const executor = createTaskExecutor({ tasks: inbox, textRouter: router, outDir });
  const task = inbox.add({ key: 'private:1', text: '帮我写一段周报' });
  const done = await executor.execute(task);
  assert.equal(done.status, 'done');
  assert.equal(done.provider, 'mock');
  assert.ok(fs.existsSync(done.resultFile));
  assert.match(fs.readFileSync(done.resultFile, 'utf8'), /这是任务结果/);
  assert.equal(calls.length, 1);

  const search = inbox.add({ key: 'private:1', text: '帮我搜索一下今天的新闻' });
  const skipped = await executor.execute(search);
  assert.equal(skipped.status, 'needs_tool');
  assert.match(skipped.error, /联网搜索/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('任务执行器使用搜索结果', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-exec-search-'));
  const inbox = createTaskInbox({ file: path.join(dir, 'tasks.json') });
  const executor = createTaskExecutor({
    tasks: inbox,
    textRouter: { async generate() { throw new Error('should not call model'); } },
    search: async (query) => [{ title: '结果一', url: 'https://example.com', snippet: `关于 ${query}` }],
    outDir: path.join(dir, 'results')
  });
  const done = await executor.execute(inbox.add({ key: 'private:1', text: '帮我搜索一下 deepseek' }));
  assert.equal(done.status, 'done');
  assert.equal(done.provider, 'bing');
  assert.match(done.result, /结果一/);
  assert.equal(done.sources.length, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});
