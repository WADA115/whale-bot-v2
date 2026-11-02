import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt, sanitizeReply, shadowReply } from '../src/core/reply.js';
import { loadConfig, validateConfig } from '../src/config.js';

test('reply 去 think/代码块/前缀并限长', () => {
  assert.equal(sanitizeReply('<think>x</think>你好'), '你好');
  assert.equal(sanitizeReply('```json\n{"a":1}\n``` 好的'), '好的');
  assert.equal(sanitizeReply('回复： 你好'), '你好');
  const long = sanitizeReply('一'.repeat(200), 20);
  assert.equal(long.length, 20);
  assert.equal(sanitizeReply('   '), '');
});

test('prompt 带人格和消息', () => {
  const prompt = buildPrompt([{ senderName: '乙', userId: '2', text: '在吗' }], {
    role: { name: '小鲸鱼', aliases: ['鱼鱼'] }
  });
  assert.match(prompt.system, /小鲸鱼/);
  assert.match(prompt.user, /乙：在吗/);
});

test('shadowReply 不输出模型内容', () => {
  const text = shadowReply([{ text: 'a' }, { text: 'b' }]);
  assert.match(text, /2 条/);
  assert.match(text, /b/);
});

test('config 示例可加载', () => {
  const { config } = loadConfig({ configPath: 'config.example.json' });
  assert.equal(config.mode, 'shadow');
  assert.ok(config.models.text.length >= 1);
});

test('config 非法模式拒绝', () => {
  assert.throws(() => validateConfig({
    mode: 'bad',
    gateway: { httpUrl: 'http://x', wsUrl: 'ws://x' },
    allow: { groups: [], private: [] },
    role: { name: 'x', aliases: [], groupTrigger: 'mention' },
    actor: { coalesceMs: 1, maxQueue: 1, maxReplyChars: 10 },
    models: { text: [{ id: 'm', type: 'ollama', baseURL: 'http://x', model: 'm' }] },
    healthPort: 3201
  }), /mode/);
});
