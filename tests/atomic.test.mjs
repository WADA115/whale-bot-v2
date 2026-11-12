import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { atomicWriteFile, atomicWriteJson, readJson } from '../src/runtime/atomic.js';

test('atomic 写入不会留下临时文件，并能覆盖旧内容', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-'));
  const file = path.join(dir, 'state.json');
  try {
    atomicWriteJson(file, { a: 1 });
    assert.deepEqual(readJson(file), { a: 1 });
    atomicWriteJson(file, { a: 2 });
    assert.deepEqual(readJson(file), { a: 2 });
    atomicWriteFile(file, 'ok');
    assert.equal(fs.readFileSync(file, 'utf8'), 'ok');
    assert.deepEqual(fs.readdirSync(dir).filter((x) => x.includes('.tmp-')), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
