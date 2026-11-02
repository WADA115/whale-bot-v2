import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../config.js';

export function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store'
  });
  res.end(body);
}

export function text(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' });
  res.end(body);
}
export function sendFile(res, file, type) {
  try {
    const body = fs.readFileSync(file);
    res.writeHead(200, { 'content-type': type, 'content-length': body.length, 'cache-control': 'no-cache' });
    res.end(body);
  } catch {
    json(res, 404, { error: 'not found' });
  }
}

export function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 200_000) req.destroy();
    });
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); } catch (error) { reject(error); }
    });
    req.on('error', reject);
  });
}

export function readLogTail(file, maxLines = 120) {
  try {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    return lines.slice(-maxLines).join('\n');
  } catch {
    return '';
  }
}

export function readV1Token(root = ROOT) {
  try {
    return fs.readFileSync(path.join(root, '..', 'qq-bridge', 'state', 'console-token'), 'utf8').trim();
  } catch {
    return '';
  }
}

export async function v1Get(pathname, root = ROOT) {
  const token = readV1Token(root);
  if (!token) throw new Error('v1 console token missing');
  const response = await fetch(`http://127.0.0.1:3100${pathname}`, {
    headers: { 'x-console-token': token },
    signal: AbortSignal.timeout(3500)
  });
  if (!response.ok) throw new Error(`v1 console http ${response.status}`);
  return response.json();
}

export function publicConfig(config, configPath) {
  return {
    configFile: path.basename(configPath || 'config.json'),
    mode: config.mode,
    allow: { groups: config.allow?.groups ?? [], private: config.allow?.private ?? [] },
    actor: {
      coalesceMs: config.actor?.coalesceMs,
      maxReplyChars: config.actor?.maxReplyChars
    },
    character: {
      enabled: config.character?.enabled,
      privateOnly: config.character?.privateOnly,
      maxChars: config.character?.maxChars,
      groupCooldownMs: config.character?.groupCooldownMs,
      taskAck: config.character?.taskAck,
      taskAutoRun: config.character?.taskAutoRun
    },
    vision: { enabled: config.vision?.enabled, provider: config.vision?.provider, model: config.vision?.model },
    asr: { enabled: config.asr?.enabled, url: config.asr?.url },
    tts: { enabled: config.tts?.enabled, voice: config.tts?.voice, privateOnly: config.tts?.privateOnly },
    knowledge: { enabled: config.knowledge?.enabled, topK: config.knowledge?.topK },
    autonomy: { enabled: config.autonomy?.enabled },
    bilibili: { enabled: config.bilibili?.enabled },
    story: {
      enabled: config.story?.enabled,
      editor: config.story?.editor?.enabled,
      agency: config.story?.agency?.enabled
    }
  };
}

export function applyConfigPatch(config, patch) {
  const bool = (value, name) => {
    if (typeof value !== 'boolean') throw new Error(`${name} 必须是布尔值`);
    return value;
  };
  const list = (value, name) => {
    if (!Array.isArray(value)) throw new Error(`${name} 必须是数组`);
    return value.map((x) => String(x).trim()).filter(Boolean).slice(0, 100);
  };
  const num = (value, name, min, max) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${name} 必须在 ${min}~${max}`);
    return n;
  };

  if (patch.mode !== undefined) {
    if (!['shadow', 'live'].includes(patch.mode)) throw new Error('mode 只能是 shadow 或 live');
    config.mode = patch.mode;
  }
  if (patch.allow?.groups !== undefined) config.allow.groups = list(patch.allow.groups, 'allow.groups');
  if (patch.allow?.private !== undefined) config.allow.private = list(patch.allow.private, 'allow.private');
  if (patch.actor?.maxReplyChars !== undefined) config.actor.maxReplyChars = num(patch.actor.maxReplyChars, 'actor.maxReplyChars', 1, 2000);
  if (patch.character?.privateOnly !== undefined) config.character.privateOnly = bool(patch.character.privateOnly, 'character.privateOnly');
  if (patch.character?.maxChars !== undefined) config.character.maxChars = num(patch.character.maxChars, 'character.maxChars', 300, 20000);
  if (patch.character?.groupCooldownMs !== undefined) config.character.groupCooldownMs = num(patch.character.groupCooldownMs, 'character.groupCooldownMs', 0, 3600000);
  if (patch.character?.taskAck !== undefined) config.character.taskAck = String(patch.character.taskAck).slice(0, 300);
  if (patch.character?.taskAutoRun !== undefined) config.character.taskAutoRun = bool(patch.character.taskAutoRun, 'character.taskAutoRun');
  if (patch.vision?.enabled !== undefined) config.vision.enabled = bool(patch.vision.enabled, 'vision.enabled');
  if (patch.asr?.enabled !== undefined) config.asr.enabled = bool(patch.asr.enabled, 'asr.enabled');
  if (patch.tts?.enabled !== undefined) config.tts.enabled = bool(patch.tts.enabled, 'tts.enabled');
  if (patch.tts?.voice !== undefined) config.tts.voice = String(patch.tts.voice).slice(0, 100);
  if (patch.tts?.privateOnly !== undefined) config.tts.privateOnly = bool(patch.tts.privateOnly, 'tts.privateOnly');
  if (patch.knowledge?.enabled !== undefined) config.knowledge.enabled = bool(patch.knowledge.enabled, 'knowledge.enabled');
  if (patch.autonomy?.enabled !== undefined) config.autonomy.enabled = bool(patch.autonomy.enabled, 'autonomy.enabled');
  if (patch.bilibili?.enabled !== undefined) config.bilibili.enabled = bool(patch.bilibili.enabled, 'bilibili.enabled');
  if (patch.story?.editor !== undefined) config.story.editor.enabled = bool(patch.story.editor, 'story.editor');
  if (patch.story?.agency !== undefined) config.story.agency.enabled = bool(patch.story.agency, 'story.agency');
  return config;
}
