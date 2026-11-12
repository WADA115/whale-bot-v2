import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPermissions } from '../src/core/permissions.js';

test('权限只对声明的会话 key 生效', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'perm-scope-'));
  try {
    const permissions = createPermissions({ file: path.join(dir, 'permissions.json'), ttlMs: 60_000 });
    const item = permissions.grant({ what: '测试', why: '测试', keys: ['private:1'], approvedBy: 'test' });
    assert.ok(item);
    assert.equal(permissions.active('private:1').length, 1);
    assert.equal(permissions.active('private:2').length, 0);
    assert.equal(permissions.active('group:1').length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
