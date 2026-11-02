import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBing, searchQueryFromTask } from '../src/core/websearch.js';

test('解析 Bing 结果', () => {
  const html = '<ol><li class="b_algo"><h2><a href="https://example.com/a">标题 &amp; 一</a></h2><p>摘要一</p></li>' +
    '<li class="b_algo"><h2><a href="https://example.com/b">标题二</a></h2><p>摘要二</p></li></ol>';
  const results = parseBing(html);
  assert.equal(results.length, 2);
  assert.equal(results[0].title, '标题 & 一');
  assert.equal(results[0].url, 'https://example.com/a');
  assert.equal(results[1].snippet, '摘要二');
});

test('从任务里提取搜索词', () => {
  assert.equal(searchQueryFromTask('帮我搜索一下 deepseek'), 'deepseek');
  assert.equal(searchQueryFromTask('查一下今天的新闻'), '今天的新闻');
});
