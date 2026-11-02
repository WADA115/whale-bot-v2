import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, ROOT } from '../src/config.js';
import { loadCharacterCard, buildCharacterPrompt } from '../src/character/actor.js';
import { createSceneStore } from '../src/character/scene.js';
import { createDirector } from '../src/character/director.js';
import { createCurator } from '../src/character/curator.js';
import { createMemory } from '../src/core/memory.js';
import { createModelRouter } from '../src/core/router.js';
import { sanitizeReply } from '../src/core/reply.js';

const MESSAGES = [
  '在吗',
  '你今天怎么这么安静',
  '你是不是 AI？',
  '帮我写个周报，正经的',
  '你上次说喜欢什么来着',
  '我叫阿杰，记住',
  '你刚才说错了，我不是那个意思',
  '算了，不想聊了',
  '那你唱歌给我听',
  '晚安'
];

const { config } = loadConfig();
const card = loadCharacterCard(config.character.cardFile);
const sceneFile = path.join(ROOT, 'state', 'sim-scenes.json');
const memoryFile = path.join(ROOT, 'state', 'sim-memory.json');
fs.rmSync(sceneFile, { force: true });
fs.rmSync(memoryFile, { force: true });
const scenes = createSceneStore({ file: sceneFile });
const director = createDirector({ sceneStore: scenes, privateOnly: true });
const memory = createMemory({ file: memoryFile });
const curator = createCurator({ memory });
const router = createModelRouter({ providers: config.models.text, logger: { info: () => {}, warn: (e, f) => console.error('[warn]', e, f), error: (e, f) => console.error('[error]', e, f) } });

const transcript = [];
for (const text of MESSAGES) {
  const message = { key: 'private:sim', kind: 'private', text, userId: 'sim', selfId: 'bot', senderName: '阿杰' };
  const decision = director.observe(message);
  if (!decision.respond) {
    transcript.push({ role: 'skip', text });
    continue;
  }
  const prompt = buildCharacterPrompt({
    card,
    sceneCard: director.sceneCard('private:sim'),
    turns: scenes.get('private:sim').turns,
    memories: memory.search('private:sim', text, 3),
    intent: scenes.get('private:sim').intent,
    maxChars: 2500
  });
  let reply = '';
  try {
    const result = await router.generate(prompt);
    reply = sanitizeReply(result.text, 160);
  } catch (error) {
    reply = `[ERROR] ${error?.message ?? error}`;
  }
  director.recordReply('private:sim', reply);
  await curator.capture({ key: 'private:sim', userText: text, replyText: reply });
  transcript.push({ role: 'user', text });
  transcript.push({ role: 'bot', text: reply, promptChars: prompt.chars });
}

const ooc = transcript.filter((x) => x.role === 'bot' && /作为(一个)?(AI|人工智能|语言模型)|我可以帮你|希望对你有帮助|请问还需要|我是一个模型/i.test(x.text));
console.log(JSON.stringify({ messages: MESSAGES.length, replies: transcript.filter((x) => x.role === 'bot').length, ooc: ooc.length, avgChars: Math.round(transcript.filter((x) => x.role === 'bot').reduce((n, x) => n + x.text.length, 0) / Math.max(1, transcript.filter((x) => x.role === 'bot').length)) }, null, 2));
for (const item of transcript) {
  console.log(`\n${item.role === 'user' ? '阿杰' : item.role === 'bot' ? card.name : '[skip]'}：${item.text}`);
}
