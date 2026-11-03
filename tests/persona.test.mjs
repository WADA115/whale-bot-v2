import assert from 'node:assert/strict';
import test from 'node:test';
import { personaFromText, personaPrompt } from '../src/http/routes.js';

test('人格草稿会解析成角色卡', () => {
  const card = personaFromText('```json\n{"name":"阿岚","identity":"一个安静的人","voice":["短句"],"world":["有人答应的事没做到，后来道歉了"],"boundaries":["不追问"]}\n```');
  assert.equal(card.name, '阿岚');
  assert.deepEqual(card.voice, ['短句']);
  assert.deepEqual(card.world, ['有人答应的事没做到，后来道歉了']);
  assert.deepEqual(card.boundaries, ['不追问']);
});

test('人格提示不写数值和示例对话', () => {
  const prompt = personaPrompt('一个安静的人');
  assert.match(prompt.system, /不要写年龄、天数、年限、次数/);
  assert.match(prompt.system, /不要写.*示例对话/);
});
