import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createPanelHandler } from '../src/http/routes.js';

test('路由冒烟：健康检查、状态和配置', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'routes-smoke-'));
  const configPath = path.join(root, 'config.json');
  const config = { mode: 'live', healthPort: 0, models: { text: [] } };
  fs.writeFileSync(configPath, JSON.stringify(config), 'utf8');
  const ctx = {
    root,
    config,
    configPath,
    panelToken: 'smoke-token',
    logger: { info() {}, warn() {} },
    health: () => ({ ok: true }),
    snapshot: () => ({ mode: 'live' })
  };
  const server = http.createServer(createPanelHandler(ctx));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  config.healthPort = port;
  const url = `http://127.0.0.1:${port}`;
  try {
    assert.equal((await fetch(url + '/healthz')).status, 200);
    assert.equal((await fetch(url + '/api/state')).status, 403);
    assert.equal((await fetch(url + '/api/state', { headers: { 'x-panel-token': 'smoke-token' } })).status, 200);
    assert.equal((await fetch(url + '/api/config', { headers: { 'x-panel-token': 'smoke-token' } })).status, 200);
  } finally {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
