#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, ROOT } from '../src/config.js';
import { loadCharacterCard } from '../src/character/actor.js';
import { createModelRouter } from '../src/core/router.js';
import { buildNarrativePrompt } from '../src/story/prompt.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { config } = loadConfig({ configPath: process.env.TRAINING_CONFIG || path.join(ROOT, 'config.json') });
const card = loadCharacterCard(config.character?.file || config.character?.cardFile || undefined);
const router = createModelRouter({ providers: config.models.text, logger: null });

function selfText() {
  const lines = ['# 我', '', card.identity || ''];
  if (card.drive) lines.push('', '## 我为什么', '', String(card.drive).trim());
  if (card.world?.length) lines.push('', '## 我见过的', ...(card.world || []).map((x) => `- ${x}`));
  return lines.join('\n');
}

const story = { self: selfText(), relationship: '', now: '', life: '', world: '' };
const scenarios = [
  {
    id: 'insult',
    who: '一个平时很熟的人',
    line: '你是不是只会敷衍？',
    impulse: '你被这句话刺到了。你想顶回去。不要解释自己，不要分析对方，不要给台阶。'
  },
  {
    id: 'cold',
    who: '一个平时很熟的人',
    line: '今天有点累，不想说话。',
    impulse: '你现在不想照顾他的情绪。随便接一句就行，不用安慰，不用追问。'
  },
  {
    id: 'praise',
    who: '一个刚加的人',
    line: '你太厉害了，什么都懂。',
    impulse: '这句话你可以收下。不用推，也不用解释。'
  }
];

for (const item of scenarios) {
  const prompt = buildNarrativePrompt({
    card,
    story,
    turns: [{ role: 'user', text: item.line }],
    notes: [`对方是：${item.who}`, item.impulse],
    maxChars: 0
  });
  const answer = await router.generate({ system: prompt.system, user: prompt.user });
  console.log(`\n## ${item.id}\n场景：${item.who}说「${item.line}」\n她：${String(answer?.text || '').trim()}\n`);
}
