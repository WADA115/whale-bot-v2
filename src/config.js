import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '..');

const DEFAULTS = {
  mode: 'shadow',
  gateway: {
    httpUrl: 'http://127.0.0.1:3000',
    wsUrl: 'ws://127.0.0.1:3001',
    accessToken: '',
    wsAccessToken: '',
    reconnectMs: 3000
  },
  allow: { groups: [], private: [] },
  role: {
    name: '小鲸鱼',
    aliases: ['鱼鱼', '小鲸鱼'],
    groupTrigger: 'mention'
  },
  actor: {
    coalesceMs: 1200,
    maxQueue: 20,
    maxReplyChars: 160
  },
  models: {
    text: [
      {
        id: 'deepseek',
        type: 'openai',
        baseURL: 'https://api.deepseek.com/v1',
        model: 'deepseek-flash',
        apiKeyEnv: 'DEEPSEEK_API_KEY',
        timeoutMs: 15000
      },
      {
        id: 'local',
        type: 'ollama',
        baseURL: 'http://127.0.0.1:11434',
        model: 'qwen3:4b',
        timeoutMs: 25000
      }
    ]
  },
  vision: { enabled: false, providers: [] },
  healthPort: 3201,
  secretsFile: 'state/secrets.json',
  shadow: { callModels: false }
};

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function merge(base, overlay) {
  if (!isObject(base) || !isObject(overlay)) return overlay ?? base;
  const out = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    out[key] = isObject(value) && isObject(base[key]) ? merge(base[key], value) : value;
  }
  return out;
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw new Error(`读取 ${file} 失败：${error.message}`);
  }
}

export function loadSecrets(file) {
  return readJson(file, {}) ?? {};
}

function requireString(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`config.${name} 必须是非空字符串`);
  return value.trim();
}

function requireArray(value, name) {
  if (!Array.isArray(value)) throw new Error(`config.${name} 必须是数组`);
  return value.map(String).filter(Boolean);
}

export function validateConfig(config) {
  if (!['shadow', 'live'].includes(config.mode)) throw new Error('config.mode 只能是 shadow 或 live');
  requireString(config.gateway?.httpUrl, 'gateway.httpUrl');
  requireString(config.gateway?.wsUrl, 'gateway.wsUrl');

  requireArray(config.allow?.groups, 'allow.groups');
  requireArray(config.allow?.private, 'allow.private');
  requireArray(config.role?.aliases, 'role.aliases');
  requireString(config.role?.name, 'role.name');

  if (!['mention', 'all'].includes(config.role?.groupTrigger)) {
    throw new Error('config.role.groupTrigger 只能是 mention 或 all');
  }

  const coalesce = Number(config.actor?.coalesceMs);
  if (!Number.isFinite(coalesce) || coalesce < 0 || coalesce > 30000) {
    throw new Error('config.actor.coalesceMs 必须是 0~30000');
  }
  const maxQueue = Number(config.actor?.maxQueue);
  if (!Number.isInteger(maxQueue) || maxQueue < 1 || maxQueue > 500) {
    throw new Error('config.actor.maxQueue 必须是 1~500 的整数');
  }
  const maxChars = Number(config.actor?.maxReplyChars);
  if (!Number.isInteger(maxChars) || maxChars < 1 || maxChars > 2000) {
    throw new Error('config.actor.maxReplyChars 必须是 1~2000 的整数');
  }

  const models = config.models?.text;
  if (!Array.isArray(models) || !models.length) throw new Error('config.models.text 至少要有一个模型');
  for (const [i, model] of models.entries()) {
    requireString(model?.id, `models.text[${i}].id`);
    if (!['openai', 'ollama'].includes(model.type)) {
      throw new Error(`models.text[${i}].type 只能是 openai 或 ollama`);
    }
    requireString(model.baseURL, `models.text[${i}].baseURL`);
    requireString(model.model, `models.text[${i}].model`);
  }

  const healthPort = Number(config.healthPort);
  if (!Number.isInteger(healthPort) || healthPort < 1 || healthPort > 65535) {
    throw new Error('config.healthPort 必须是 1~65535 的整数');
  }
  return config;
}

export function loadConfig({ configPath = path.join(ROOT, 'config.json') } = {}) {
  const fileConfig = readJson(configPath, {});
  const config = merge(DEFAULTS, fileConfig);
  const secretsPath = path.isAbsolute(config.secretsFile)
    ? config.secretsFile
    : path.join(ROOT, config.secretsFile);
  const secrets = loadSecrets(secretsPath);

  if (!config.gateway.accessToken) config.gateway.accessToken = String(secrets.snowlumaAccessToken ?? '');
  if (!config.gateway.wsAccessToken) config.gateway.wsAccessToken = String(secrets.snowlumaWsAccessToken ?? '');
  config.models.text = config.models.text.map((model) => {
    const keyFromSecrets = model.id === 'deepseek' ? secrets.deepseekApiKey : '';
    const apiKey = String(process.env[model.apiKeyEnv ?? ''] ?? keyFromSecrets ?? model.apiKey ?? '').trim();
    return { ...model, apiKey };
  });
  config.vision = config.vision && typeof config.vision === 'object' ? config.vision : {};
  config.vision.providers = (config.vision.providers ?? []).map((provider) => {
    const key = String(
      process.env[provider.apiKeyEnv ?? '']
      ?? (provider.secretName ? secrets[provider.secretName] : '')
      ?? provider.apiKey
      ?? ''
    ).trim();
    return { ...provider, apiKey: key };
  });
  for (const key of ['roleFile', 'memoryFile']) {
    if (config[key] && !path.isAbsolute(config[key])) config[key] = path.join(ROOT, config[key]);
  }
  const relative = [
    [config.character, 'cardFile'],
    [config.character, 'sceneFile'],
    [config.character, 'taskFile'],
    [config.character, 'slangFile'],
    [config.character, 'relationshipFile'],
    [config.character?.expression, 'stickersFile'],
    [config.character?.initiative, 'file'],
    [config.bilibili, 'cookieFile'],
    [config.autonomy, 'stateFile'],
    [config.story, 'dir'],
    [config.story?.agency, 'stateFile'],
    [config.knowledge, 'dbPath']
  ];
  for (const [owner, key] of relative) {
    if (owner?.[key] && !path.isAbsolute(owner[key])) owner[key] = path.join(ROOT, owner[key]);
  }

  validateConfig(config);
  return { config, configPath, secretsPath };
}
