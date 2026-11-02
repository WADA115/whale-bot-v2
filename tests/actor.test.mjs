import test from 'node:test';
import assert from 'node:assert/strict';
import { createActorRegistry } from '../src/core/actor.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('actor 合并同一会话的突发消息', async () => {
  const turns = [];
  const actors = createActorRegistry({
    coalesceMs: 20,
    onTurn: async (key, batch) => turns.push({ key, texts: batch.map((x) => x.text) })
  });
  actors.enqueue('group:1', { text: 'a' });
  actors.enqueue('group:1', { text: 'b' });
  actors.enqueue('group:1', { text: 'c' });
  await sleep(90);
  assert.equal(turns.length, 1);
  assert.deepEqual(turns[0].texts, ['a', 'b', 'c']);
});

test('actor 同一会话串行，不同会话并行', async () => {
  let active = 0;
  let maxActive = 0;
  const turns = [];
  const actors = createActorRegistry({
    coalesceMs: 5,
    onTurn: async (key) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await sleep(40);
      turns.push(key);
      active -= 1;
    }
  });
  actors.enqueue('group:1', { text: 'a' });
  actors.enqueue('group:2', { text: 'b' });
  await sleep(15);
  actors.enqueue('group:1', { text: 'c' });
  await sleep(180);
  assert.equal(maxActive, 2);
  assert.deepEqual(turns.sort(), ['group:1', 'group:1', 'group:2']);
});

test('actor 队列上限保留最新消息', async () => {
  const batches = [];
  const actors = createActorRegistry({
    coalesceMs: 5,
    maxQueue: 2,
    onTurn: async (_key, batch) => batches.push(batch.map((x) => x.text))
  });
  actors.enqueue('g', { text: '0' });
  await sleep(20);
  actors.enqueue('g', { text: '1' });
  actors.enqueue('g', { text: '2' });
  actors.enqueue('g', { text: '3' });
  await sleep(80);
  assert.deepEqual(batches[0], ['0']);
  assert.deepEqual(batches[1], ['2', '3']);
});
