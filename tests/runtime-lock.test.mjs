import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { acquireRuntimeLock } from '../src/runtime/lock.js';

test('运行锁不会被复用 PID 的旧文件永久占住', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-lock-'));
  const file = path.join(root, 'runtime.lock');
  try {
    fs.writeFileSync(file, JSON.stringify({ pid: process.pid, at: Date.now() - 6 * 60 * 1000 }), 'utf8');
    const lock = acquireRuntimeLock({ file });
    assert.equal(lock.ok, true);
    lock.release();
    assert.equal(fs.existsSync(file), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
