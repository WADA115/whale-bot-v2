import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/config.js';
import { loadCharacterCard } from '../src/character/actor.js';
import { createStoryStore } from '../src/story/store.js';
import { createStoryEditor } from '../src/story/editor.js';
import { createModelRouter } from '../src/core/router.js';

const { config } = loadConfig();
const card = loadCharacterCard(config.character.cardFile);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'story-live-'));
const store = createStoryStore({ root: dir });
store.ensure('private:test', card);
store.writeSection('private:test', 'now', '# 此刻\n\n没什么特别想的，先听他说。', card);
const editor = createStoryEditor({
  store,
  textRouter: createModelRouter({ providers: config.models.text, logger: console }),
  logger: console
});
await editor.update({
  key: 'private:test',
  card,
  story: store.read('private:test', card),
  turns: [{ role: 'user', text: '今天好累' }],
  userText: '今天好累，不想说话',
  reply: '那先歇着，不用硬撑。'
});
console.log('--- now ---');
console.log(store.read('private:test').now);
console.log('--- relationship ---');
console.log(store.read('private:test').relationship);
console.log('--- episodes ---');
console.log(store.listEpisodes('private:test'));
