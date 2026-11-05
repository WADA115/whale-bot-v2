#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, ROOT } from '../src/config.js';
import { loadCharacterCard } from '../src/character/actor.js';
import { createModelRouter } from '../src/core/router.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const packFile = path.join(HERE, 'scenarios', 'reactions.json');
const scenarios = JSON.parse(fs.readFileSync(packFile, 'utf8'));
const { config } = loadConfig({ configPath: process.env.TRAINING_CONFIG || path.join(ROOT, 'config.json') });
const card = loadCharacterCard(config.character?.file || config.character?.cardFile || undefined);
const router = createModelRouter({ providers: config.models.text, logger: null });

const report = ['# 第一反应', ''];
for (const item of scenarios) {
  const system = [
    `你是${card.name}。`,
    `对方是：${item.who}`,
    `他刚才说：${item.line}`,
    '',
    '先不要考虑后果。',
    '如果不过脑子，你第一句会回什么？只写那一句。',
    '不要写动作，不要写画面，不要解释，不要分析，不要总结。'
  ].join('\n');
  const answer = await router.generate({ system, user: '' });
  const reaction = String(answer?.text || '').trim();
  report.push(`## ${item.id}`, '', `场景：${item.who}说「${item.line}」`, '', `第一反应：${reaction}`, '');
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dir = path.join(HERE, 'runs', stamp);
fs.mkdirSync(dir, { recursive: true });
const outFile = path.join(dir, 'reactions.md');
fs.writeFileSync(outFile, report.join('\n') + '\n', 'utf8');
console.log(report.join('\n'));
console.log(`\n结果文件：${outFile}`);
