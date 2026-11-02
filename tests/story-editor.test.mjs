import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStoryStore } from '../src/story/store.js';
import { createStoryEditor, parseEditorOutput } from '../src/story/editor.js';

test('Editor 解析多句思考/预测/打算', () => {
  const parsed = parseEditorOutput([
    '【此刻】',
    '他今天话少。',
    '我想问，又觉得不该追。',
    '【心里】',
    '他刚才那句不像随口说的。',
    '可能只是累。',
    '【猜】',
    '我猜他不是冲我。',
    '【打算】',
    '先接一句，不追问。',
    '【关系】',
    '# 我们',
    '熟了一点。'
  ].join('\n'));
  assert.match(parsed.now, /话少/);
  assert.match(parsed.now, /心里/);
  assert.match(parsed.now, /不是冲我/);
  assert.match(parsed.now, /不追问/);
  assert.match(parsed.relationship, /熟了一点/);
});

test('Editor 写回、长档案与遗忘', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-editor-'));
  const store = createStoryStore({ root: dir });
  store.ensure('private:1', { name: '小鲸鱼', identity: '鱼' });
  store.addEpisode('private:1', '他第一次说累', '完整档案'.repeat(50), '只记得他累。');
  const editor = createStoryEditor({
    store,
    textRouter: { generate: async () => ({ text: [
      '【此刻】',
      '他今天话少。',
      '【心里】',
      '我有点想问，又觉得不该追。',
      '【旧事】',
      '标题：他第一次说累',
      '还记得：只记得他那天很累，细节模糊了。'
    ].join('\n') }) }
  });
  await editor.update({
    key: 'private:1',
    card: { name: '小鲸鱼' },
    story: store.read('private:1'),
    turns: [],
    userText: '今天好累',
    reply: '那先歇着。'
  });
  const story = store.read('private:1');
  assert.match(story.now, /今天话少/);
  assert.match(story.now, /不该追/);
  assert.match(story.episodes[0].text, /细节模糊/);
  assert.doesNotMatch(story.episodes[0].text, /完整档案完整档案/);
  fs.rmSync(dir, { recursive: true, force: true });
});
