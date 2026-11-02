import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createStoryStore } from '../src/story/store.js';

function tempStore() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'story-lock-'));
  const store = createStoryStore({ root });
  store.ensure('private:1', { name: '小鲸鱼', identity: '鱼' });
  return { root, store };
}

test('story version 递增，写入是原子的', () => {
  const { root, store } = tempStore();
  assert.equal(store.read('private:1').version, 0);
  store.writeSection('private:1', 'now', '# 此刻\n\n第一段');
  const first = store.read('private:1');
  assert.equal(first.version, 1);
  assert.match(first.now, /第一段/);
  store.writeSection('private:1', 'now', '# 此刻\n\n第二段');
  assert.equal(store.read('private:1').version, 2);
  const files = fs.readdirSync(path.join(root, 'private_1'));
  assert.equal(files.some((name) => name.includes('.tmp-')), false);
});

test('story apply 用旧版本写入时会冲突而不是覆盖', () => {
  const { store } = tempStore();
  const old = store.read('private:1');
  store.writeSection('private:1', 'now', '# 此刻\n\n别人刚写的');
  assert.throws(
    () => store.apply('private:1', { now: '# 此刻\n\n编辑迟到的' }, null, old.version),
    (error) => error.code === 'STORY_CONFLICT'
  );
  assert.match(store.read('private:1').now, /别人刚写的/);
});

test('story 过期锁会接管', () => {
  const { root, store } = tempStore();
  const lock = path.join(root, 'private_1', '.lock');
  fs.writeFileSync(lock, 'stale', 'utf8');
  const old = new Date(Date.now() - 60_000);
  fs.utimesSync(lock, old, old);
  store.writeSection('private:1', 'relationship', '# 我们\n\n新的关系');
  assert.equal(fs.existsSync(lock), false);
  assert.match(store.read('private:1').relationship, /新的关系/);
});

test('story apply 一次写多个部分只增加一个版本', () => {
  const { store } = tempStore();
  store.apply('private:1', {
    now: '# 此刻\n\n一起吃饭',
    relationship: '# 我们\n\n熟了一点',
    event: { title: '一起吃饭', full: '完整档案', trace: '只记得吃了饭' },
    chapter: { title: '第一天', text: '章节内容' }
  }, null, 0);
  const story = store.read('private:1');
  assert.equal(story.version, 1);
  assert.match(story.now, /一起吃饭/);
  assert.match(story.relationship, /熟了一点/);
  assert.equal(story.episodes.length, 1);
  assert.equal(story.chapters.length, 1);
});
