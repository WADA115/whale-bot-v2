import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

test('watchdog 第二个实例会被锁挡住', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'watchdog-test-'));
  const lock = path.join(root, 'watchdog.lock');
  const log = path.join(root, 'watchdog.log');
  const cfg = path.join(root, 'watchdog.json');
  fs.writeFileSync(cfg, JSON.stringify({ lockFile: lock, logFile: log, healthUrl: 'http://127.0.0.1:1/healthz' }));
  const script = path.resolve('scripts/watchdog.mjs');
  const env = { ...process.env, WATCHDOG_CONFIG: cfg, WATCHDOG_DRY: '1', WATCHDOG_HOLD_MS: '1800' };
  const first = spawn(process.execPath, [script], { cwd: path.resolve('.'), env, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 300));
  const started = Date.now();
  const second = spawn(process.execPath, [script], { cwd: path.resolve('.'), env, stdio: 'ignore' });
  const code = await new Promise((resolve) => second.on('exit', resolve));
  const elapsed = Date.now() - started;
  await new Promise((resolve) => first.on('exit', resolve));
  assert.equal(code, 0);
  assert.ok(elapsed < 1000, `second took ${elapsed}ms`);
  fs.rmSync(root, { recursive: true, force: true });
});
