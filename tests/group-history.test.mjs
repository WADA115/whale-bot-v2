import assert from 'node:assert/strict';
import test from 'node:test';
import { readGroupHistory } from '../src/runtime/group-history.js';

test('读群历史时只取原话', async () => {
  const { groupName, lines } = await readGroupHistory({
    groupId: '1',
    gateway: {
      call: async () => ({
        group_name: '测试群',
        messages: [
          { sender: { card: '甲' }, raw_message: '今天好累' },
          { sender: { nickname: '乙' }, raw_message: '[CQ:at,qq=1] 早点睡' }
        ]
      })
    }
  });
  assert.equal(groupName, '测试群');
  assert.deepEqual(lines, ['甲：今天好累', '乙：早点睡']);
});
