#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, ROOT } from '../src/config.js';
import { loadCharacterCard } from '../src/character/actor.js';
import { createModelRouter } from '../src/core/router.js';
import { buildNarrativePrompt } from '../src/story/prompt.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((item, index, all) => {
  if (!item.startsWith('--')) return null;
  return [item.slice(2), all[index + 1] ?? true];
}).filter(Boolean));

const packName = String(args.pack || 'basic');
const packFile = path.join(HERE, 'scenarios', `${packName}.json`);
if (!fs.existsSync(packFile)) {
  console.error(`没有这个情境包：${packFile}`);
  process.exit(1);
}
const families = JSON.parse(fs.readFileSync(packFile, 'utf8'));
const { config } = loadConfig({ configPath: process.env.TRAINING_CONFIG || path.join(ROOT, 'config.json') });
const card = loadCharacterCard(config.character?.file || config.character?.cardFile || undefined);
const router = createModelRouter({ providers: config.models.text, logger: null });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.join(HERE, 'runs', stamp);
const memoryDir = path.join(HERE, 'memory');
fs.mkdirSync(outDir, { recursive: true });
if (args.remember) fs.mkdirSync(memoryDir, { recursive: true });

function selfText() {
  const lines = ['# 我', '', card.identity || ''];
  if (card.drive) lines.push('', '## 我为什么', '', String(card.drive).trim());
  if (card.world?.length) lines.push('', '## 我见过的', ...(card.world || []).map((x) => `- ${x}`));
  return lines.join('\n');
}

const baseStory = {
  self: selfText(),
  relationship: '',
  now: '',
  life: '',
  world: ''
};

function memoryFile(variant) {
  const key = String(variant.memory || variant.id || 'default').replace(/[^0-9A-Za-z_-]/g, '_');
  return path.join(memoryDir, `${key}.jsonl`);
}

function readMemory(variant) {
  if (!args.remember) return [];
  try {
    return fs.readFileSync(memoryFile(variant), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function appendMemory(variant, entry) {
  if (!args.remember) return;
  try {
    fs.mkdirSync(memoryDir, { recursive: true });
    fs.appendFileSync(memoryFile(variant), JSON.stringify(entry) + '\n', 'utf8');
  } catch {}
}

async function say(turns, text, note = '') {
  const prompt = buildNarrativePrompt({
    card,
    story: baseStory,
    turns,
    notes: [note].filter(Boolean),
    maxChars: 0
  });
  const answer = await router.generate({ system: prompt.system, user: prompt.user });
  return String(answer?.text || '').trim();
}

async function otherPerson(who, history) {
  const transcript = history
    .map((turn) => `${turn.role === 'assistant' ? '她' : '我'}：${turn.text}`)
    .join('\n');
  const answer = await router.generate({
    system: [
      `你是${who}。`,
      '你正在和对方说话。',
      '',
      transcript,
      '',
      '只看她刚才那句话，说你的下一句。',
      '只写你会说的话，不要旁白，不要解释。'
    ].join('\n'),
    user: ''
  });
  return String(answer?.text || '').trim();
}

const report = ['# 训练记录', '', `情境包：${packName}`, ''];
for (const family of families) {
  report.push(`## ${family.title}`, '');
  for (const variant of family.variants || []) {
    const history = [];
    const prior = readMemory(variant);
    const memoryNote = prior.length
      ? `以前类似的事：\n${prior.slice(-4).map((item) => `对方：${item.user}\n我：${item.reply}`).join('\n')}`
      : '';
    report.push(`### ${variant.id}`, '');
    report.push(`- 场景：${variant.who || family.title}`);
    if (variant.note) report.push(`- 备注：${variant.note}`);
    if (prior.length) report.push(`- 上一次：有记录`);
    const who = variant.who ? `对方是：${variant.who}` : '';
    const rounds = Number(variant.rounds) > 0 ? Number(variant.rounds) : 2;
    let line = String(variant.line || '');
    for (let round = 0; round < rounds; round += 1) {
      report.push('', `对方：${line}`);
      history.push({ role: 'user', text: line });
      let reply = '';
      try {
        reply = await say(history, line, [who, memoryNote].filter(Boolean).join('\n'));
      } catch (error) {
        reply = `（生成失败：${String(error?.message ?? error)}）`;
      }
      report.push('', `她：${reply}`, '');
      history.push({ role: 'assistant', text: reply });
      appendMemory(variant, { who: variant.who || '', user: line, reply, at: new Date().toISOString() });
      if (round >= rounds - 1) break;
      try {
        line = await otherPerson(variant.who || '对方', history);
      } catch (error) {
        line = `（对方生成失败：${String(error?.message ?? error)}）`;
      }
      if (!line) break;
    }
    const followUps = args.fixed ? (variant.followUps || []) : [];
    for (const follow of followUps) {
      report.push('', `对方：${follow}`);
      history.push({ role: 'user', text: follow });
      let reply = '';
      try {
        reply = await say(history, follow, [who, memoryNote].filter(Boolean).join('\n'));
      } catch (error) {
        reply = `（生成失败：${String(error?.message ?? error)}）`;
      }
      report.push('', `她：${reply}`, '');
      history.push({ role: 'assistant', text: reply });
      appendMemory(variant, { who: variant.who || '', user: follow, reply, at: new Date().toISOString() });
    }
  }
}

const outFile = path.join(outDir, `${packName}.md`);
fs.writeFileSync(outFile, report.join('\n') + '\n', 'utf8');
console.log(outFile);
