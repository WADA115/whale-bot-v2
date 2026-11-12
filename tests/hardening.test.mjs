import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { canUseBiliWrite } from '../src/runtime/actor-turn.js';
import { createBilibili } from '../src/platform/bilibili.js';
import { createMindStore } from '../src/mind/store.js';
import { createWriteGate } from '../src/runtime/write-gate.js';

test('B站写工具只允许私聊且有有效权限', () => {
  const permissions = { active: (key) => key === 'private:1' ? [{ id: 'p1' }] : [] };
  assert.equal(canUseBiliWrite({ kind: 'group', key: 'group:1', permissions }), false);
  assert.equal(canUseBiliWrite({ kind: 'private', key: 'private:2', permissions }), false);
  assert.equal(canUseBiliWrite({ kind: 'private', key: 'private:1', permissions }), true);
  assert.equal(canUseBiliWrite({ kind: 'private', key: 'private:1', permissions: null }), false);
});

test('B站对象不再暴露 cookieHeader', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bili-'));
  try {
    const bili = createBilibili({ file: path.join(root, 'bili.json') });
    assert.equal('cookieHeader' in bili, false);
    assert.equal('cookieHeader' in bili.status(), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('mind 追加内容有上限，保留最近内容', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mind-'));
  try {
    const mind = createMindStore({ root });
    for (let i = 0; i < 30; i += 1) mind.appendUndercurrent(`${i}-` + 'x'.repeat(1000));
    const text = mind.read().undercurrent;
    assert.ok(text.length <= 12000, `length ${text.length}`);
    assert.match(text, /29-/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('对外写工具一轮最多一次，群聊直接拒绝', () => {
  const permissions = { active: (key) => key === 'private:1' ? [{ id: 'allow' }] : [] };
  const gate = createWriteGate({ permissions, key: 'private:1', kind: 'private' });
  assert.equal(gate.consume('post_qzone'), true);
  assert.equal(gate.consume('reach_out'), false);
  const groupGate = createWriteGate({ permissions, key: 'group:1', kind: 'group' });
  assert.equal(groupGate.consume('reach_out'), false);
});