import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createStoryStore } from '../src/story/store.js';
import { createLiveGroup } from '../src/runtime/live-group.js';
import { createWorldObserver } from '../src/runtime/world-observer.js';

const card = { name: '鱼', identity: '鱼' };

test('世界记忆只积累原话，生活线由当下动作生成', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'observer-'));
  const store = createStoryStore({ root });
  store.ensure('group:1', card);
  const liveGroup = createLiveGroup();
  liveGroup.observe({ kind: 'group', key: 'group:1', text: '今天风很大', senderName: 'A' });
  let calls = 0;
  const observer = createWorldObserver({
    storyStore: store,
    liveGroup,
    textRouter: { generate: async () => { calls += 1; return { text: '在听他们说话' }; } },
    character: { card }
  });
  await observer.tick();
  const story = store.read('group:1', card);
  assert.match(story.world, /今天风很大/);
  assert.equal(story.life, '在听他们说话');
  assert.equal(calls, 1);
  await observer.tick();
  assert.equal(calls, 1);
});
