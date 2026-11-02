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
import { routeIncoming } from '../src/character/ingress.js';

const messages = [
  ['甲', '@鱼鱼 在不'],
  ['乙', '今天打什么'],
  ['甲', '@鱼鱼 帮我写个周报'],
  ['乙', '@鱼鱼 你刚才说错了'],
  ['甲', '晚安']
];

const { config } = loadConfig();
const card = loadCharacterCard(config.character.cardFile);
const sceneFile = path.join(ROOT, 'state', 'group-sim-scenes.json');
const memoryFile = path.join(ROOT, 'state', 'group-sim-memory.json');
fs.rmSync(sceneFile, { force: true });
fs.rmSync(memoryFile, { force: true });
const scenes = createSceneStore({ file: sceneFile });
const director = createDirector({ sceneStore: scenes, privateOnly: false });
const memory = createMemory({ file: memoryFile });
const curator = createCurator({ memory });
const router = createModelRouter({
  providers: config.models.text,
  logger: { info: () => {}, warn: (e, f) => console.error('[warn]', e, f), error: (e, f) => console.error('[error]', e, f) }
});
const key = 'group:sim';
for (const [name, text] of messages) {
  const route = routeIncoming(text);
  if (route.kind !== 'social') {
    console.log(`[skip task] ${name}: ${text}`);
    continue;
  }
  const decision = director.observe({ key, kind: 'group', text, senderName: name });
  if (!decision.respond) {
    console.log(`[skip] ${name}: ${text} (${decision.reason})`);
    continue;
  }
  const scene = scenes.get(key);
  const mem = memory.search(key, text, 3);
  const prompt = buildCharacterPrompt({
    card,
    sceneCard: director.sceneCard(key),
    turns: scene.turns,
    memories: mem.length ? mem : memory.recent(key, 3),
    intent: scene.intent,
    maxChars: 2500
  });
  let reply = '';
  try {
    const result = await router.generate(prompt);
    reply = sanitizeReply(result.text, 160);
  } catch (error) {
    reply = `[ERROR] ${error?.message ?? error}`;
  }
  director.recordReply(key, reply);
  await curator.capture({ key, userText: text, replyText: reply });
  console.log(`\n${name}：${text}\n${card.name}：${reply}`);
}
