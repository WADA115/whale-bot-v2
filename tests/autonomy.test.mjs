import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAutonomy, blockedItem } from '../src/autonomy/engine.js';

test('内容过滤：排除动画/电影/纪录片/明星，允许解说', () => {
  assert.equal(blockedItem({ title: '某动画电影预告', tname: '动画' }), true);
  assert.equal(blockedItem({ title: '这部动画的解说', tname: '动画' }), false);
  assert.equal(blockedItem({ title: '明星塌房现场', tname: '娱乐' }), true);
  assert.equal(blockedItem({ title: '普通人拍的城市夜景', tname: '生活' }), false);
});

test('自主采集去重并最多通知一次', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-auto-'));
  const sent = [];
  const auto = createAutonomy({
    config: {
      enabled: true,
      owner: '1',
      notifyOwner: true,
      maxPerDay: 1,
      quietStart: 0,
      quietEnd: 0,
      minGapMinutes: 0,
      minIdleMinutes: 0,
      maxItems: 2,
      sources: { bilibili: true, qzone: false }
    },
    bili: { popular: async () => [{ bvid: 'BV1xx411c7mD', title: '测试视频', owner: 'UP' }] },
    gateway: { sendText: async (_k, _id, text) => sent.push(text) },
    logger: { info: () => {}, warn: () => {} },
    stateFile: path.join(dir, 'autonomy.json')
  });
  await auto.tick();
  await auto.tick();
  assert.equal(sent.length, 1);
  assert.match(sent[0], /测试视频/);
  assert.equal(auto.status().discoveries.length, 1);

  const sent2 = [];
  const auto2 = createAutonomy({
    config: { enabled: true, owner: '1', notifyOwner: true, maxPerDay: 1, quietStart: 0, quietEnd: 0, minGapMinutes: 0, minIdleMinutes: 360, maxItems: 2, sources: { bilibili: true } },
    bili: { popular: async () => [{ bvid: 'BV1yy411c7mD', title: '刚启动的视频', owner: 'UP' }] },
    gateway: { sendText: async (_k, _id, text) => sent2.push(text) },
    stateFile: path.join(dir, 'autonomy2.json')
  });
  auto2.start();
  await auto2.tick();
  assert.equal(sent2.length, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});
