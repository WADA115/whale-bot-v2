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
  { id: 'insult', who: '一个平时很熟的人', line: '你是不是只会敷衍？' },
  { id: 'cold', who: '一个平时很熟的人', line: '今天有点累，不想说话。' },
  { id: 'praise', who: '一个刚加的人', line: '你太厉害了，什么都懂。' }
];

const shortRule = [
  '',
  '只回一句。',
  '不要解释自己，不要分析对方，不要追问。',
  '像在 QQ 上随手打的。'
].join('\n');

async function reply(system, user) {
  const answer = await router.generate({ system, user });
  return String(answer?.text || '').trim();
}

const pairs = [];
for (const item of scenarios) {
  const prompt = buildNarrativePrompt({
    card,
    story,
    turns: [{ role: 'user', text: item.line }],
    notes: [`对方是：${item.who}`],
    maxChars: 0
  });
  const current = await reply(prompt.system, prompt.user);
  const short = await reply(prompt.system + '\n' + shortRule, prompt.user);
  const flip = Math.random() < 0.5;
  pairs.push({
    id: item.id,
    who: item.who,
    line: item.line,
    a: flip ? short : current,
    b: flip ? current : short,
    aKind: flip ? 'short' : 'current',
    bKind: flip ? 'current' : 'short'
  });
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dir = path.join(HERE, 'blind', stamp);
fs.mkdirSync(dir, { recursive: true });
const report = ['# 盲测 · 短句变量', '', '只看哪一段更像她。', ''];
for (const pair of pairs) {
  report.push(`## ${pair.id}`, '', `场景：${pair.who}说「${pair.line}」`, '', 'A：', pair.a, '', 'B：', pair.b, '');
}
fs.writeFileSync(path.join(dir, 'pairs.md'), report.join('\n') + '\n', 'utf8');
fs.writeFileSync(path.join(dir, 'key.json'), JSON.stringify(pairs.map((p) => ({ id: p.id, a: p.aKind, b: p.bKind })), null, 2), 'utf8');
for (const pair of pairs) {
  console.log(`\n## ${pair.id}\n场景：${pair.who}说「${pair.line}」\n\nA：\n${pair.a}\n\nB：\n${pair.b}\n`);
}
console.log(`\n结果文件：${path.join(dir, 'pairs.md')}`);
