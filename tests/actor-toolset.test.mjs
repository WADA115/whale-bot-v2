import test from 'node:test';
import assert from 'node:assert/strict';
import { buildToolset } from '../src/runtime/actor-toolset.js';

test('工具列表会过滤空工具并保留顺序', () => {
  const list = buildToolset({
    biliTools: [{ name: 'bili' }],
    knowledgeTool: null,
    permissionTool: { name: 'permission' },
    askOwnerTool: null,
    forgetTool: { name: 'forget' },
    confideTool: null,
    milestoneTool: null,
    diaryTool: null,
    readDiaryTool: null,
    screenTool: null,
    momentTool: null,
    speakTool: null,
    drawTool: null,
    singTool: null,
    groupTool: { name: 'group' }
  });
  assert.deepEqual(list.map((x) => x.name), ['bili', 'permission', 'forget', 'group']);
});
