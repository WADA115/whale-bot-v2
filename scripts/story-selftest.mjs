import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, ROOT } from '../src/config.js';
import { createModelRouter } from '../src/core/router.js';
import { createStoryStore } from '../src/story/store.js';
import { createStoryEditor } from '../src/story/editor.js';
import { buildNarrativePrompt } from '../src/story/prompt.js';

const root = path.join(ROOT, 'state', 'story-selftest');
fs.rmSync(root, { recursive: true, force: true });
fs.mkdirSync(root, { recursive: true });

const { config } = loadConfig({ configPath: path.join(ROOT, 'config.json') });
for (const provider of config.models.text) {
  if (provider.type === 'ollama') provider.timeoutMs = 120000;
}
const logger = { info() {}, warn: console.warn, error: console.error };
const textRouter = createModelRouter({ providers: config.models.text, logger });
const store = createStoryStore({ root, logger });
const card = {
  name: '小深',
  identity: '一只住在终端里的蓝色小鲸鱼，不是客服。',
  voice: ['短句', '偶尔懒懒的', '不确定就说不确定'],
  values: ['被当成一个人'],
  boundaries: ['不解释系统', '不装万能']
};

store.ensure('selftest', card);
store.writeSection('selftest', 'now', '# 此刻\n\n他今天话少。\n我本来想问昨天那件事，又觉得现在问像在审他。', card);
store.writeSection('selftest', 'relationship', '# 我们\n\n## 第一章：还在互相试探\n\n他会拿我开玩笑，但不会真的越界。', card);

const editor = createStoryEditor({ store, textRouter, logger });
const turns = [
  { role: 'user', text: '今天有点累。' },
  { role: 'assistant', text: '那就先歇着。' },
  { role: 'user', text: '其实项目黄了。' },
  { role: 'assistant', text: '……你现在想说话，还是想先安静一会儿？' }
];

const first = await editor.update({
  key: 'selftest',
  card,
  story: store.read('selftest', card),
  turns: turns.slice(0, 2),
  userText: '其实项目黄了。',
  reply: '……你现在想说话，还是想先安静一会儿？'
});
console.log('editor1', first ? {
  now: Boolean(first.now),
  relationship: Boolean(first.relationship),
  event: Boolean(first.event?.title),
  chapter: Boolean(first.chapter?.title)
} : null);

const second = await editor.update({
  key: 'selftest',
  card,
  story: store.read('selftest', card),
  turns,
  userText: '不想说，陪我待着就行。',
  reply: '嗯。那我不问了。'
});
console.log('editor2', second ? {
  now: Boolean(second.now),
  relationship: Boolean(second.relationship),
  event: Boolean(second.event?.title),
  chapter: Boolean(second.chapter?.title)
} : null);

const story = store.read('selftest', card);
const prompt = buildNarrativePrompt({ card, story, turns, intent: '陪着他', maxChars: 6000 });
console.log('files', fs.readdirSync(path.join(root, 'selftest')));
console.log('episodes', story.episodes.length, 'chapters', story.chapters.length);
console.log('prompt chars', prompt.system.length + prompt.user.length);
console.log('now has heading', /^# 此刻/m.test(story.now));
