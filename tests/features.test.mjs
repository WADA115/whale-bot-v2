import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createKnowledge } from '../src/core/knowledge.js';
import { imageSegments } from '../src/core/vision.js';

test('knowledge 只读检索', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-kb-'));
  const dbPath = path.join(dir, 'knowledge.db');
  const db = new DatabaseSync(dbPath);
  db.exec('CREATE TABLE chunks (id INTEGER PRIMARY KEY, document_id INTEGER, text TEXT)');
  db.prepare('INSERT INTO chunks(id,document_id,text) VALUES (1,10,?)').run('小鲸鱼是一只会聊天的鲸鱼');
  db.close();
  const knowledge = createKnowledge({ dbPath, topK: 2 });
  const result = knowledge.search('小鲸鱼 聊天');
  assert.equal(result.lines.length, 1);
  assert.match(result.lines[0], /小鲸鱼/);
  assert.equal(result.evidence.length, 1);
  knowledge.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('vision 只取图片段', () => {
  const segs = imageSegments({ segments: [
    { type: 'text', data: { text: 'x' } },
    { type: 'image', data: { url: 'https://x/a.jpg' } },
    { type: 'image', data: { file: 'b.jpg' } },
    { type: 'image', data: {} }
  ] });
  assert.equal(segs.length, 2);
});
