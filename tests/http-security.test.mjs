import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createPanelHandler } from '../src/http/routes.js';

test('保存配置保留原文件里的密钥，并要求 panel token', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-config-'));
  const configPath = path.join(root, 'config.json');
  const config = {
    mode: 'shadow',
    healthPort: 3201,
    models: { text: [{ id: 'deepseek', apiKey: 'secret-key' }] },
    vision: { providers: [{ id: 'v', apiKey: 'vision-key' }] },
    gateway: { accessToken: 'gw-token', wsAccessToken: 'ws-token' }
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  const ctx = { root, config, configPath, panelToken: 'panel-token', logger: { info() {}, warn() {} } };
  const server = http.createServer(createPanelHandler(ctx));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  config.healthPort = port;
  const url = `http://127.0.0.1:${port}/api/config`;
  try {
    const noToken = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'shadow' }) });
    assert.equal(noToken.status, 403);
    const badOrigin = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-panel-token': 'panel-token', origin: 'http://127.0.0.1:9999' },
      body: JSON.stringify({ mode: 'shadow' })
    });
    assert.equal(badOrigin.status, 403);
    const ok = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-panel-token': 'panel-token', origin: `http://127.0.0.1:${port}` },
      body: JSON.stringify({ mode: 'shadow' })
    });
    assert.equal(ok.status, 200);
    const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(saved.models.text[0].apiKey, 'secret-key');
    assert.equal(saved.vision.providers[0].apiKey, 'vision-key');
    assert.equal(saved.gateway.accessToken, 'gw-token');
  } finally {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
