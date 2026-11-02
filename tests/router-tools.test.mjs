import assert from 'node:assert/strict';
import test from 'node:test';
import { createModelRouter } from '../src/core/router.js';

test('模型可以自己调用看群动作', async () => {
  let calls = 0;
  let executed = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) {
      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: null,
              tool_calls: [{
                id: 'call-1',
                type: 'function',
                function: { name: 'look_group_history', arguments: '{}' }
              }]
            }
          }]
        })
      };
    }
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '看到了。' } }]
      })
    };
  };
  const router = createModelRouter({
    providers: [{ id: 'fake', type: 'openai', apiKey: 'x', baseURL: 'http://fake', model: 'm' }],
    fetchImpl
  });
  const result = await router.generateWithTools({
    system: '你是鱼',
    user: '我有点好奇',
    tools: [{
      type: 'function',
      function: { name: 'look_group_history', description: '看群', parameters: { type: 'object', properties: {} } }
    }],
    execute: async (name) => {
      executed += 1;
      assert.equal(name, 'look_group_history');
      return '甲：今天好累';
    }
  });
  assert.equal(executed, 1);
  assert.equal(calls, 2);
  assert.equal(result.text, '看到了。');
});
