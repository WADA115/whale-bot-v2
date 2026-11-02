import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseSticker } from '../src/character/expression.js';
import { matchSlang } from '../src/character/slang.js';

test('表情按关键词命中', () => {
  const stickers = [
    { desc: '笑死', url: 'https://x/1' },
    { desc: '睡觉猫', url: 'https://x/2' }
  ];
  assert.equal(chooseSticker('笑死我了', stickers)?.desc, '笑死');
  assert.equal(chooseSticker('晚安', stickers)?.desc, '睡觉猫');
  assert.equal(chooseSticker('普通聊天', stickers), null);
});

test('黑话命中并带解释', () => {
  const entries = [{ term: '捏', meaning: '语气词' }, { term: '冒泡', meaning: '出现' }];
  assert.match(matchSlang('出来冒泡捏', entries).join('；'), /冒泡.*出现/);
  assert.equal(matchSlang('普通聊天', entries).length, 0);
});
