import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTaskInbox } from '../src/character/tasks.js';

test('任务入站箱持久化', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-task-'));
  const file = path.join(dir, 'tasks.json');
  const inbox = createTaskInbox({ file });
  const task = inbox.add({ key: 'private:1', text: '帮我写周报', userId: 'u1' });
  assert.ok(task.id);
  assert.equal(inbox.count(), 1);
  assert.equal(inbox.list({ limit: 5 })[0].text, '帮我写周报');
  const reloaded = createTaskInbox({ file });
  assert.equal(reloaded.count(), 1);
  fs.rmSync(dir, { recursive: true, force: true });
});
