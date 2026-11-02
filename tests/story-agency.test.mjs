import test from 'node:test';
import assert from 'node:assert/strict';
import { createStoryAgency } from '../src/story/agency.js';

test('story 打算触发主动发言', async () => {
  const sent = [];
  const agency = createStoryAgency({
    store: { read: () => ({ self: '# 我', relationship: '# 我们', now: '# 此刻\n\n先听他说。\n\n# 打算\n\n等会儿想问问他昨天怎么了。', episodes: [] }) },
    gateway: { sendText: async (_kind, _id, text) => sent.push(text) },
    textRouter: { generate: async () => ({ text: '你昨天是不是有事没说？' }) },
    card: { name: '小鲸鱼' },
    getScene: () => ({ turns: [] }),
    config: { enabled: true, minIdleMinutes: 0, maxPerDay: 1, minGapMinutes: 0, quietStart: 0, quietEnd: 0, maxChars: 900 },
    stateFile: ''
  });
  agency.touch('private:1');
  await agency.tick();
  assert.equal(sent.length, 1);
  assert.match(sent[0], /昨天/);
});

test('没有打算不主动', async () => {
  const sent = [];
  const agency = createStoryAgency({
    store: { read: () => ({ self: '', relationship: '', now: '# 此刻\n\n先不追问。', episodes: [] }) },
    gateway: { sendText: async () => sent.push('x') },
    textRouter: { generate: async () => ({ text: '不该发' }) },
    card: { name: '小鲸鱼' },
    config: { enabled: true, minIdleMinutes: 0, maxPerDay: 1, minGapMinutes: 0, quietStart: 0, quietEnd: 0 }
  });
  agency.touch('private:1');
  await agency.tick();
  assert.equal(sent.length, 0);
});
