import http from 'node:http';
import path from 'node:path';
import { loadConfig, ROOT } from './config.js';
import { createLogger } from './log.js';
import { OneBotGateway } from './gateway/onebot.js';
import { createActorRegistry } from './core/actor.js';
import { decide } from './core/policy.js';
import { createModelRouter } from './core/router.js';
import { bingSearch } from './core/websearch.js';
import { createVisionRouter } from './core/vision.js';
import { createAsr } from './core/asr.js';
import { createTts } from './core/tts.js';
import { createKnowledge } from './core/knowledge.js';
import { loadCharacterCard } from './character/actor.js';
import { createSceneStore } from './character/scene.js';
import { createDirector } from './character/director.js';
import { createTaskInbox } from './character/tasks.js';
import { createTaskExecutor } from './character/executor.js';
import { loadStickers } from './character/expression.js';
import { loadSlang } from './character/slang.js';
import { createBilibili } from './platform/bilibili.js';
import { createAutonomy } from './autonomy/engine.js';
import { createStoryStore } from './story/store.js';
import { createStoryEditor } from './story/editor.js';
import { createStoryAgency } from './story/agency.js';
import { createActorTurn } from './runtime/actor-turn.js';
import { createPanelHandler } from './http/routes.js';
import { createCapabilities } from './runtime/capabilities.js';
import { createMetrics } from './runtime/metrics.js';
import { createLiveGroup } from './runtime/live-group.js';

const V1_ROOT = path.join(ROOT, '..', 'qq-bridge');
const FFMPEG = process.env.FFMPEG_PATH || path.join(V1_ROOT, 'tools', 'ffmpeg', 'ffmpeg.exe');
const TTS_SCRIPT = process.env.TTS_SCRIPT || path.join(V1_ROOT, 'src', 'tts-edge.mjs');

function parseArgs(argv) {
  const args = { shadow: false, configPath: path.join(ROOT, 'config.json') };

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--shadow') args.shadow = true;
    else if (argv[i] === '--config' && argv[i + 1]) {
      args.configPath = path.resolve(argv[i + 1]);
      i += 1;
    }
  }
  return args;
}


export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const { config, configPath } = loadConfig({ configPath: args.configPath });
  if (args.shadow) config.mode = 'shadow';
  const logger = createLogger({ dir: path.join(ROOT, 'state', 'logs'), level: 'info' });
  const gateway = new OneBotGateway({ ...config.gateway, logger });
  const textRouter = createModelRouter({ providers: config.models.text, logger });
  const visionRouter = createVisionRouter({ providers: config.vision?.providers ?? [], logger });
  const asr = config.asr?.enabled !== false
    ? createAsr({
      url: config.asr?.url || 'http://127.0.0.1:3199',
      ffmpegPath: config.asr?.ffmpegPath || FFMPEG,
      timeoutMs: Number(config.asr?.timeoutMs) || 30000,
      logger
    })
    : null;
  const tts = config.tts?.enabled
    ? createTts({
      scriptPath: config.tts.scriptPath || TTS_SCRIPT,
      voice: config.tts.voice || 'zh-CN-XiaoyiNeural',
      outDir: config.tts.outDir || path.join(ROOT, 'state', 'voice'),
      timeoutMs: Number(config.tts.timeoutMs) || 30000,
      logger
    })
    : null;
  const knowledge = config.knowledge?.enabled
    ? createKnowledge({ dbPath: config.knowledge.dbPath, topK: config.knowledge.topK, logger })
    : null;
  const tasks = createTaskInbox({ file: config.character?.taskFile, logger });
  const taskExecutor = createTaskExecutor({
    tasks,
    textRouter,
    search: bingSearch,
    logger,
    outDir: path.join(ROOT, 'state', 'tasks', 'results'),
    onResult: async (task) => {
      if (!task || task.status !== 'done' || !task.result) return;
      if (config.mode !== 'live' || !connected) return;
      const [kind, id] = String(task.key || '').split(':');
      if (!['private', 'group'].includes(kind) || !id) return;
      await gateway.sendText(kind, id, `任务做完了。

${task.result}`);
      logger.info('task.sent', { id: task.id, kind });
    }
  });
  const stickers = loadStickers(config.character?.expression?.stickersFile);
  const expressionCooldowns = new Map();
  const slang = loadSlang(config.character?.slangFile);
  const bilibili = config.bilibili?.enabled ? createBilibili({ file: config.bilibili.cookieFile, logger }) : null;
  const autonomy = createAutonomy({
    config: { ...(config.autonomy ?? {}), owner: config.autonomy?.owner || config.allow.private?.[0] || '' },
    bili: bilibili,
    gateway,
    logger,
    stateFile: config.autonomy?.stateFile
  });
  autonomy.start();
  let character = null;
  if (config.character?.enabled) {
    try {
      const card = loadCharacterCard(config.character.cardFile);
      const scenes = createSceneStore({ file: config.character.sceneFile, logger });
      character = {
        card,
        scenes,
        director: createDirector({ sceneStore: scenes, privateOnly: config.character.privateOnly !== false, groupTrigger: config.role?.groupTrigger || 'mention', aliases: config.role?.aliases || [], logger }),
        maxChars: Number(config.character.maxChars) || 2500,
        groupCooldownMs: Number(config.character.groupCooldownMs) || 8000
      };
    } catch (error) {
      logger.error('character.init_failed', { error: String(error?.message ?? error) });
    }
  }
  const storyStore = config.story?.enabled ? createStoryStore({ root: config.story.dir, logger }) : null;
  const storyEditor = storyStore && config.story?.editor?.enabled !== false
    ? createStoryEditor({ store: storyStore, textRouter, logger })
    : null;
  const storyAgency = storyStore && config.story?.agency?.enabled
    ? createStoryAgency({
      store: storyStore,
      gateway,
      textRouter,
      card: character?.card,
      getScene: (key) => character?.scenes?.get(key) ?? { turns: [] },
      logger,
      config: config.story.agency,
      stateFile: config.story.agency.stateFile
    })
    : null;
  storyAgency?.start();
  const capabilities = createCapabilities({
    config,
    gateway,
    asr,
    tts,
    textRouter,
    visionProviders: config.vision?.providers ?? [],
    bilibili,
    storyStore,
    character
  });
  const callModels = config.mode === 'live' || config.shadow?.callModels === true;
  const startedAt = Date.now();
  let connected = false;
  const groupCooldowns = new Map();
  const inboundSeq = new Map();
  const liveGroup = createLiveGroup();

  const stats = { sent: 0, imageCount: 0 };
  const metrics = createMetrics();
  const actorTurn = createActorTurn({
    config,
    character,
    storyStore,
    storyEditor,
    textRouter,
    autonomy,
    storyAgency,
    tasks,
    taskExecutor,
    visionRouter,
    asr,
    tts,
    knowledge,
    slang,
    stickers,
    gateway,
    logger,
    groupCooldowns,
    expressionCooldowns,
    stats,
    metrics,
    inboundSeq,
    liveGroup,
    callModels
  });

  const actors = createActorRegistry({
    coalesceMs: config.actor.coalesceMs,
    maxQueue: config.actor.maxQueue,
    logger,
    onTurn: actorTurn
  });
  gateway.on('ready', (login) => {
    connected = true;
    logger.info('gateway.ready', { id: login.id, nickname: login.nickname, selfId: gateway.selfId });
  });
  gateway.on('status', ({ connected: up }) => {
    connected = Boolean(up);
  });

  function dispatchMessage(message) {
    if (message.kind === 'group') liveGroup.observe(message);
    if (gateway.isSelf(message)) {
      logger.debug('message.self_ignored', { key: message.key });
      return;
    }
    const decision = decide({ message, config, selfId: gateway.selfId });
    if (!decision.handle) {
      logger.debug('message.skipped', { key: message.key, reason: decision.reason, text: String(message.text ?? '').slice(0, 60) });
      return;
    }
    inboundSeq.set(message.key, (inboundSeq.get(message.key) || 0) + 1);
    actors.enqueue(message.key, message);
  }

  gateway.on('message', (payload) => {
    dispatchMessage(gateway.normalize(payload));
  });

  function snapshotState() {
    return {
      status: {
        mode: config.mode,
        connected,
        selfId: gateway.selfId,
        uptimeSec: Math.round((Date.now() - startedAt) / 1000),
        sent: stats.sent,
        imageCount: stats.imageCount,
        tasks: tasks.count()
      },
      card: character?.card ?? null,
      scenes: character?.scenes.snapshot() ?? {},
      bilibili: bilibili?.status() ?? { enabled: false, loggedIn: false },
      autonomy: autonomy.status(),
      story: storyStore?.listChats() ?? [],
      tasks: tasks.list({ limit: 20 })
    };
  }

  function healthState() {
    return {
      ok: connected || (config.mode === 'shadow' && config.gateway.enabled === false),
      mode: config.mode,
      connected,
      selfId: gateway.selfId,
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      sent: stats.sent,
      imageCount: stats.imageCount,
      actors: actors.snapshot(),
      knowledge: Boolean(knowledge),
      character: Boolean(character),
      tasks: tasks.count(),
      memoryFile: config.memoryFile
    };
  }

  function metricsState() {
    return {
      mode: config.mode,
      connected,
      sent: stats.sent,
      imageCount: stats.imageCount,
      actorCount: Object.keys(actors.snapshot()).length,
      actors: actors.snapshot(),
      router: textRouter.health(),
      metrics: metrics.snapshot()
    };
  }

  function metricsText() {
    return metrics.prometheus();
  }

  const handler = createPanelHandler({
    root: ROOT,
    config,
    configPath,
    logger,
    gateway,
    character,
    bilibili,
    autonomy,
    storyStore,
    tasks,
    taskExecutor,
    actors,
    knowledge,
    textRouter,
    isConnected: () => connected,
    snapshot: snapshotState,
    health: healthState,
    metrics: metricsText,
    metricsJson: metricsState,
    dispatch: dispatchMessage,
    capabilities
  });
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.healthPort, '127.0.0.1', resolve);
  });
  logger.info('app.started', {
    mode: config.mode,
    healthPort: config.healthPort,
    callModels,
    vision: Boolean(visionRouter),
    asr: Boolean(asr),
    tts: Boolean(tts),
    knowledge: Boolean(knowledge)
  });
  if (config.gateway.enabled !== false) gateway.connect();

  const shutdown = () => {
    logger.info('app.shutdown', {});
    gateway.close();
    knowledge?.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return { gateway, server, actors, router: textRouter, config };
}
