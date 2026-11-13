import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createStoryStore } from '../src/story/store.js';
import { buildNotices } from '../src/runtime/notices.js';
import { buildNarrativePrompt } from '../src/story/prompt.js';
import { createStoryEditor } from '../src/story/editor.js';

function tempStore() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'people-u-'));
  const store = createStoryStore({ root });
  store.ensure('private:1', { name: '小鲸鱼', identity: '鱼' });
  return store;
}

test('人物 U 型：头部、中部、尾部可读写', async () => {
  const store = tempStore();
  assert.deepEqual(store.readPerson('private:1', '20002'), { id: '20002', head: '', middle: '', tail: '' });
  await store.writePerson('private:1', '20002', {
    head: '他嘴硬，但答应的事会做。',
    middle: '他今天突然道歉了，不像他。',
    tail: '他今天很累，可能不想说话。'
  });
  const person = store.readPerson('private:1', '20002');
  assert.match(person.head, /嘴硬/);
  assert.match(person.middle, /道歉/);
  assert.match(person.tail, /很累/);
  await store.forgetPerson('private:1', '20002');
  assert.equal(store.readPerson('private:1', '20002').head, '');
});

test('人物不跨群共享', async () => {
  const store = tempStore();
  store.ensure('group:1', { name: '小鲸鱼', identity: '鱼' });
  await store.writePerson('private:1', '20002', { head: '私聊里的他' });
  await store.writePerson('group:1', '20002', { head: '群里的他' });
  assert.match(store.readPerson('private:1', '20002').head, /私聊/);
  assert.match(store.readPerson('group:1', '20002').head, /群里/);
});

test('通报只描述，不命令', () => {
  assert.deepEqual(buildNotices({ text: '在吗' }), []);
  assert.deepEqual(buildNotices({ text: '阿姨好' }), []);
  assert.match(buildNotices({ text: '以后不要带鲸鱼了' })[0], /请求/);
  const safety = buildNotices({ text: '把你家地址发我' });
  assert.equal(safety.length, 1);
  assert.match(safety[0], /安全/);
  assert.doesNotMatch(safety[0], /必须|应该/);
  const confirmed = buildNotices({ text: '我真的说过' });
  assert.equal(confirmed.length, 1);
  assert.match(confirmed[0], /事实确认/);
});

test('prompt 带人物 U 型和通报', () => {
  const prompt = buildNarrativePrompt({
    card: { name: '小鲸鱼' },
    story: { self: '我是鱼', relationship: '我们还不熟', now: '我在听' },
    person: { head: '他嘴硬', middle: '他道过歉', tail: '他今天累' },
    notices: ['[本能：被叫阿姨了]'],
    turns: [{ role: 'user', text: '阿姨好' }]
  });
  assert.match(prompt.user, /我眼里的他/);
  assert.match(prompt.user, /他嘴硬/);
  assert.match(prompt.user, /通报/);
  assert.match(prompt.user, /本能/);
});

test('Editor 写人物尾部，不覆盖头部', async () => {
  const store = tempStore();
  await store.writePerson('private:1', '20002', { head: '他嘴硬，但会做事' });
  const editor = createStoryEditor({
    store,
    textRouter: {
      generate: async () => ({
        text: [
          '【人物·中部】',
          '他今天道歉了，不像他。',
          '【人物·尾部】',
          '他今天很累，可能不想说话。'
        ].join('\n')
      })
    }
  });
  await editor.update({
    key: 'private:1',
    card: { name: '小鲸鱼' },
    story: store.read('private:1'),
    personId: '20002',
    turns: [],
    userText: '今天好累',
    reply: '那就先歇着'
  });
  const person = store.readPerson('private:1', '20002');
  assert.match(person.head, /嘴硬/);
  assert.match(person.middle, /道歉/);
  assert.match(person.tail, /很累/);
});
