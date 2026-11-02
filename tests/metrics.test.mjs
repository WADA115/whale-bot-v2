import assert from 'node:assert/strict';
import test from 'node:test';
import { createMetrics } from '../src/runtime/metrics.js';
import { createCapabilities } from '../src/runtime/capabilities.js';

test('metrics 计数、计时和 Prometheus 文本', () => {
  const metrics = createMetrics();
  metrics.inc('qqbot_messages_received_total', { kind: 'private' }, 2);
  metrics.observe('qqbot_turn_duration_seconds', 0.12, { kind: 'private' });
  const text = metrics.prometheus();
  assert.match(text, /qqbot_messages_received_total\{kind="private"\} 2/);
  assert.match(text, /qqbot_turn_duration_seconds_bucket\{le="0.25",kind="private"\} 1/);
  assert.match(text, /qqbot_turn_duration_seconds_count 1/);
});

test('capabilities 能区分 up / down / logged-out', async () => {
  const capabilities = createCapabilities({
    config: { mode: 'live' },
    gateway: { selfId: '1', ws: { readyState: 1 } },
    asr: { health: async () => ({ ok: true, url: 'http://asr' }) },
    tts: { health: async () => ({ ok: false, error: 'missing' }) },
    textRouter: { health: () => ({ deepseek: { failures: 0 } }) },
    visionProviders: [{ id: 'v', model: 'm' }],
    bilibili: { status: () => ({ enabled: true, loggedIn: false }) },
    storyStore: {},
    character: {}
  });
  const result = await capabilities.snapshot();
  assert.equal(result.gateway.state, 'up');
  assert.equal(result.asr.state, 'up');
  assert.equal(result.tts.state, 'down');
  assert.equal(result.bilibili.state, 'logged-out');
  assert.deepEqual(result.degraded.sort(), ['bilibili', 'tts']);
});
