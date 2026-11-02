import assert from 'node:assert/strict';
import test from 'node:test';
import { selectRelevantSlices } from '../src/story/retrieval.js';

test('旧事检索取相关切片，不按最近堆叠', () => {
  const story = {
    episodes: [
      { title: '显卡', text: '他说要给我买显卡。' },
      { title: '午饭', text: '今天吃了面。' },
      { title: '加班', text: '他最近总加班。' }
    ],
    chapters: []
  };
  const selected = selectRelevantSlices(story, '你上次说的显卡呢');
  assert.equal(selected.episodes.length, 1);
  assert.match(selected.episodes[0].text, /显卡/);
});

test('没有相关词时只保留一条最近的事', () => {
  const story = {
    episodes: [
      { title: '旧事', text: '很久以前。' },
      { title: '新事', text: '刚刚发生。' }
    ],
    chapters: []
  };
  const selected = selectRelevantSlices(story, '在吗');
  assert.equal(selected.episodes.length, 1);
  assert.match(selected.episodes[0].text, /刚刚/);
});
