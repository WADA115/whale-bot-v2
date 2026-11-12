import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
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
import { createRvc } from './core/rvc.js';
import { createMansui } from './core/mansui.js';
import { createPermissions } from './core/permissions.js';
import { createConversationLog } from './core/conversation-log.js';
import { createContacts } from './core/contacts.js';
import { createMoments } from './core/moments.js';
import { createLimiter } from './core/limiter.js';
import { createDiary } from './core/diary.js';
import { createMilestones } from './core/milestones.js';
import { createMemorySummary } from './core/memory-summary.js';
import { createDraw } from './core/draw.js';
import { createSing } from './core/sing.js';
import { createKnowledge } from './core/knowledge.js';
import { loadCharacterCard } from './character/actor.js';
import { createSceneStore } from './character/scene.js';
import { createDirector } from './character/director.js';
import { createTaskInbox } from './character/tasks.js';
import { createTaskExecutor } from './character/executor.js';
import { loadStickers } from './character/expression.js';
import { loadSlang } from './character/slang.js';
import { createSlangObserver } from './character/slang-observer.js';
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
import { createWorldObserver } from './runtime/world-observer.js';
import { createLocalChat } from './runtime/local-chat.js';
import { createMediaLibrary } from './core/media-library.js';
import { createLocalHistory } from './core/local-history.js';
import { createDailyDiary } from './core/daily-diary.js';
import { createScreen } from './core/screen.js';
import { createRoomServer } from './room/server.js';
import { createRoomAI } from './room/ai.js';
import { acquireRuntimeLock } from './runtime/lock.js';
import { createMindStore } from './mind/store.js';
import { createDaydream } from './mind/daydream.js';

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
  const runtimeLock = acquireRuntimeLock({ file: path.join(ROOT, 'state', 'runtime.lock'), logger });
  if (!runtimeLock.ok) return { skipped: true, reason: 'already-running' };
  const shutdownTokenFile = path.join(ROOT, 'state', 'shutdown.token');
  let shutdownToken = '';
  try { shutdownToken = fs.readFileSync(shutdownTokenFile, 'utf8').trim(); } catch {}
  if (!shutdownToken) {
    shutdownToken = randomUUID();
    fs.mkdirSync(path.dirname(shutdownTokenFile), { recursive: true });
    fs.writeFileSync(shutdownTokenFile, shutdownToken, 'utf8');
  }
  const gateway = new OneBotGateway({ ...config.gateway, logger });
  const textRouter = createModelRouter({ providers: config.models.text, logger });
  const visionLimiter = createLimiter({ limit: 1 });
  const asrLimiter = createLimiter({ limit: 1 });
  const rvcLimiter = createLimiter({ limit: 1 });
  const visionRouter = createVisionRouter({
    providers: config.vision?.providers ?? [],
    ffmpegPath: FFMPEG,
    cacheFile: path.join(ROOT, 'state', 'cache', 'vision.json'),
    logger
  });
  visionRouter?.warmup?.().catch(() => {});
  const asr = config.asr?.enabled !== false
    ? createAsr({
      url: config.asr?.url || 'http://127.0.0.1:3199',
      ffmpegPath: config.asr?.ffmpegPath || FFMPEG,
      timeoutMs: Number(config.asr?.timeoutMs) || 30000,
      cacheFile: path.join(ROOT, 'state', 'cache', 'asr.json'),
      vad: config.asr?.vad !== false,
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
  const mansui = config.mansui?.enabled && config.mansui.pythonPath && config.mansui.scriptPath
    ? createMansui({
        url: config.mansui.url,
        refAudio: config.mansui.refAudio,
        promptText: config.mansui.promptText,
        promptLang: config.mansui.promptLang,
        outDir: config.mansui.outDir || path.join(ROOT, 'state', 'voice'),
        idleMs: Number(config.mansui.idleMs) || 1800000,
        logger
      })
    : null;
  const rvc = config.rvc?.enabled && config.rvc.scriptPath && config.rvc.pythonPath
    ? createRvc({
        scriptPath: config.rvc.scriptPath,
        pythonPath: config.rvc.pythonPath,
        model: config.rvc.model,
        device: config.rvc.device || 'cpu',
        url: config.rvc.url || '',
        outDir: config.rvc.outDir || path.join(ROOT, 'state', 'voice'),
        logger
      })
    : null;
  const draw = config.draw?.enabled !== false
    ? createDraw({
      pythonPath: config.draw?.pythonPath || '',
      outDir: config.draw?.outDir || path.join(ROOT, 'state', 'draw'),
      logger
    })
    : null;
  const sing = config.sing?.enabled !== false
    ? createSing({
      voice: config.tts?.voice || 'zh-CN-XiaoyiNeural',
      ttsScript: config.tts?.scriptPath || TTS_SCRIPT,
      outDir: config.sing?.outDir || path.join(ROOT, 'state', 'sing'),
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
  const slang = loadSlang(config.character?.slangFile, config.knowledge?.dbPath);
  const slangObserver = createSlangObserver({
    file: config.character?.slangFile,
    dbPath: config.knowledge?.dbPath,
    entries: slang,
    textRouter,
    vision: visionRouter,
    config: { ...(config.slangObserver || {}), allowedGroups: config.allow?.groups || [] },
    logger
  });
  slangObserver.start();
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
  const mind = createMindStore({ root: path.join(ROOT, 'state', 'mind'), character, logger });
  const session = mind.beginSession();
  logger.info('mind.session', { woke: Boolean(session.wake), gap: session.gap });
  const heartbeat = setInterval(() => { try { mind.heartbeat(); } catch {} }, 60 * 1000);
  heartbeat.unref?.();
  const daydream = createDaydream({ mind, textRouter, storyStore, character, gateway, config, liveGroup, logger });
  daydream.start();
  const conversationLog = createConversationLog({ limit: 80 });
  const contacts = createContacts({ file: path.join(ROOT, 'state', 'contacts.json'), logger });
  const moments = createMoments({ file: path.join(ROOT, 'state', 'moments.json'), logger });
  const diary = createDiary({ file: path.join(ROOT, 'state', 'diary.json'), logger });
  const milestones = createMilestones({ file: path.join(ROOT, 'state', 'milestones.json'), logger });
  const memorySummary = createMemorySummary({
    file: path.join(ROOT, 'state', 'memory-summary.md'),
    metaFile: path.join(ROOT, 'state', 'memory-summary.meta.json'),
    textRouter, diary, milestones, contacts, logger
  });
  memorySummary.refresh({ force: false }).catch(() => {});
  const summaryTimer = setInterval(() => memorySummary.refresh().catch(() => {}), 6 * 60 * 60 * 1000);
  summaryTimer.unref?.();
  gateway.on('sent', ({ kind, id, segments }) => {
    const text = (Array.isArray(segments) ? segments : []).filter((x) => x?.type === 'text').map((x) => String(x?.data?.text ?? '')).join(' ').trim();
    if (text) conversationLog.add({ key: `${kind}:${id}`, kind, id: String(id), sender: '我', text, at: Date.now() });
  });
  const permissions = createPermissions({
    file: path.join(ROOT, 'state', 'permissions.json'),
    logger
  });
  const screen = createScreen({
    root: path.join(ROOT, 'state'),
    scriptPath: path.join(ROOT, 'scripts', 'capture-screen.ps1'),
    powershell: path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    logger
  });
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
    screen,
    asr,
    tts,
    rvc,
    mansui,
    permissions,
    conversationLog,
    contacts,
    moments,
    diary,
    milestones,
    memorySummary,
    visionLimiter,
    asrLimiter,
    rvcLimiter,
    draw,
    sing,
    mind,
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
    bilibili,
    callModels
  });

  const worldObserver = storyStore ? createWorldObserver({
    config: config.world ?? {},
    storyStore,
    liveGroup,
    gateway,
    bilibili,
    textRouter,
    character,
    logger
  }) : null;
  worldObserver?.start();

  const actors = createActorRegistry({
    coalesceMs: config.actor.coalesceMs,
    maxQueue: config.actor.maxQueue,
    logger,
    onTurn: actorTurn
  });
  let slangBackfillStarted = false;
  async function backfillSlang() {
    const groups = (config.allow?.groups || []).map(String);
    const markerFile = path.join(ROOT, 'state', 'slang-backfill.json');
    let marks = {};
    try { marks = JSON.parse(fs.readFileSync(markerFile, 'utf8')); } catch {}
    const now = Date.now();
    let changed = false;
    for (const groupId of groups) {
      if (now - Number(marks[groupId] || 0) < 6 * 60 * 60 * 1000) continue;
      try {
        const result = await gateway.getGroupHistory({ groupId, count: 30 });
        const messages = result?.data?.messages || result?.messages || [];
        for (const raw of messages) {
          try {
            slangObserver.observe(gateway.normalize(raw));
          } catch {}
        }
        marks[groupId] = now;
        changed = true;
        logger.info('slang.backfilled', { groupId, count: messages.length });
      await slangObserver.flush();
      } catch (error) {
        logger.warn('slang.backfill_failed', { groupId, error: String(error?.message ?? error) });
      }
    }
    if (changed) {
      try {
        fs.mkdirSync(path.dirname(markerFile), { recursive: true });
        fs.writeFileSync(markerFile, JSON.stringify(marks, null, 2), 'utf8');
      } catch {}
    }
  }
  gateway.on('ready', (login) => {
    connected = true;
    logger.info('gateway.ready', { id: login.id, nickname: login.nickname, selfId: gateway.selfId });
    if (!slangBackfillStarted) {
      slangBackfillStarted = true;
      setTimeout(() => { backfillSlang().catch(() => {}); }, 1500);
    }
  });
  gateway.on('status', ({ connected: up }) => {
    connected = Boolean(up);
    if (up) backfillSlang().catch((error) => logger.warn('slang.backfill_failed', { error: String(error?.message ?? error) }));
  });

  async function interpretPermissionReply(text, key = '') {
    const pending = permissions.candidates(key);
    if (!pending.length || !String(text || '').trim()) return;
    try {
      const list = pending.map((x) => `${x.id}｜${x.what}｜${x.why || '没解释'}`).join('\n');
      const who = key.startsWith('group:') ? '群友' : '主人';
      const answer = await textRouter.generate({
        system: `你在判断${who}对一条权限请求的回复。口语可能很随意：行、给、可以、批了、拿去、随你、没问题都算同意；不行、算了、不给、想得美、滚都算拒绝；闲聊、追问、普通聊天、没明确表态算 none。还要听范围和时间：再加20分钟 addMinutes=20；减少/缩短20分钟 addMinutes=-20；改成10分钟 setMinutes=10；不要私聊/私聊不行 exclude=["private"]；不要群聊/群里不行 exclude=["group"]；默认都开 exclude=[]。只输出 JSON：{"decision":"approve|deny|none","id":"编号","addMinutes":0,"setMinutes":0,"exclude":[]}。不确定就 none。`,
        user: `待批/已给：\n${list}\n\n${who}说：${text}`,
        maxTokens: 600,
        temperature: 0
      });
      const match = String(answer?.text || '').match(/\{[\s\S]*\}/);
      if (!match) return;
      const parsed = JSON.parse(match[0]);
      if (parsed.decision === 'approve' || parsed.decision === 'deny') {
        const req = permissions.decide(parsed.id, parsed.decision === 'approve', key);
        if (req) logger.info('permission.answered', { id: req.id, decision: parsed.decision, chars: String(text).length });
      }
      const addMinutes = Number(parsed.addMinutes) || 0;
      const setMinutes = Number(parsed.setMinutes) || 0;
      const exclude = Array.isArray(parsed.exclude) ? parsed.exclude : [];
      if (addMinutes || setMinutes || exclude.length) {
        permissions.adjust(parsed.id, { addMinutes, setMinutes, exclude }, key);
      }
    } catch (error) {
      logger.warn('permission.interpret_failed', { error: String(error?.message ?? error) });
    }
  }

  async function interpretProactiveGrant(text, key = '') {
    const raw = String(text || '').trim();
    if (!raw || raw.length > 80) return;
    if (!/可以|允许|准|给你|拿去|骂|权限|分钟|小时|今天|这次|随便/.test(raw)) return;
    if (permissions.candidates(key).length) return;
    try {
      const who = key.startsWith('group:') ? '群友' : '主人';
      const answer = await textRouter.generate({
        system: `你在判断${who}是不是在主动给一个权限，不是回复待批请求。只有明确说“可以骂/允许你/给你十分钟/今天随便”才算；普通聊天、反问、拒绝都不算。输出 JSON：{"grant":true,"what":"要允许的事","addMinutes":0,"setMinutes":0,"exclude":[]} 或 {"grant":false}。不要解释。`,
        user: `${who}说：${raw}`,
        maxTokens: 500,
        temperature: 0
      });
      const match = String(answer?.text || '').match(/\{[\s\S]*\}/);
      if (!match) return;
      const parsed = JSON.parse(match[0]);
      if (parsed.grant !== true) return;
      const owner = String(config.allow?.private?.[0] || '');
      const ownerKey = owner ? `private:${owner}` : '';
      const keys = key.startsWith('group:') ? [key, ownerKey].filter(Boolean) : [];
      const add = Number(parsed.addMinutes) || 0;
      const set = Number(parsed.setMinutes) || 0;
      const durationMs = set ? set * 60_000 : (30 + add) * 60_000;
      const grant = permissions.grant({ what: parsed.what || raw, why: `${who}主动给的`, keys, approvedBy: key, durationMs });
      if (grant && Array.isArray(parsed.exclude) && parsed.exclude.length) {
        permissions.adjust(grant.id, { exclude: parsed.exclude }, key);
      }
      logger.info('permission.direct_grant', { id: grant?.id, what: grant?.what, keys: grant?.keys, approvedBy: key });
    } catch (error) {
      logger.warn('permission.grant_interpret_failed', { error: String(error?.message ?? error) });
    }
  }

  const groupApprovers = String(config.permissions?.groupApprovers || 'owner').toLowerCase() === 'any' ? 'any' : 'owner';

  async function dispatchMessage(message) {
    if (message.kind === 'group') {
      liveGroup.observe(message);
      slangObserver.observe(message);
    }
    if (gateway.isSelf(message)) {
      logger.debug('message.self_ignored', { key: message.key });
      return;
    }
    conversationLog.add({
      key: message.key, kind: message.kind, id: message.id,
      sender: message.senderName || message.userId || '',
      text: message.text || (message.images?.length ? '[图片]' : ''), at: Date.now()
    });
    if (message.text && !message.local) contacts.remember({ id: message.userId, name: message.senderName, key: message.key, text: message.text });
    if (message.replyTo) {
      try { message.quoted = await gateway.getMessage(message.replyTo); } catch {}
    }
    const ownerId = String(config.allow?.private?.[0] || '');
    if (message.kind === 'private' && String(message.id) === ownerId) {
      const waiting = permissions.pending(message.key).length > 0;
      if (waiting) interpretPermissionReply(message.text, message.key).catch(() => {});
      else {
        interpretPermissionReply(message.text, message.key).catch(() => {});
        interpretProactiveGrant(message.text, message.key).catch(() => {});
      }
    } else if (message.kind === 'group' && groupApprovers !== 'owner') {
      const waiting = permissions.pending(message.key).length > 0;
      if (waiting) interpretPermissionReply(message.text, message.key).catch(() => {});
      else {
        interpretPermissionReply(message.text, message.key).catch(() => {});
        interpretProactiveGrant(message.text, message.key).catch(() => {});
      }
    }
    mind.touchContact();
    const decision = message.local ? { handle: true, reason: 'local' } : decide({ message, config, selfId: gateway.selfId });
    if (!decision.handle && !message.dryRun) {
      logger.debug('message.skipped', { key: message.key, reason: decision.reason, chars: String(message.text ?? '').length });
      return;
    }
    inboundSeq.set(message.key, (inboundSeq.get(message.key) || 0) + 1);
    actors.enqueue(message.key, message);
  }

  const mediaLibrary = createMediaLibrary({ root: path.join(ROOT, 'state', 'media'), logger });
  let stickerImportJob = null;
  async function importQQStickers() {
    if (stickerImportJob) return stickerImportJob;
    stickerImportJob = (async () => {
      let imported = 0;
      let failed = 0;
      const list = Array.isArray(stickers) ? stickers : [];
      for (let i = 0; i < list.length; i += 4) {
        await Promise.all(list.slice(i, i + 4).map(async (item) => {
          try {
            await mediaLibrary.addUrl({ scope: 'user', kind: 'sticker', url: item.url, name: item.desc || item.id || 'QQ表情', desc: item.desc || '', origin: item.url });
            imported += 1;
          } catch { failed += 1; }
        }));
      }
      logger.info('stickers.imported', { imported, failed });
      return { total: list.length, imported, failed };
    })().finally(() => { stickerImportJob = null; });
    return stickerImportJob;
  }
  const localHistory = createLocalHistory({ file: path.join(ROOT, 'state', 'local-history.json'), logger });
  const dailyDiary = createDailyDiary({ diary, localHistory, textRouter, character, logger });
  setTimeout(() => dailyDiary.maybeWrite().catch(() => {}), 6000).unref?.();
  setInterval(() => dailyDiary.maybeWrite().catch(() => {}), 30 * 60 * 1000).unref?.();
  let roomAI = null;
  const roomPort = Number(config.room?.port) || 3210;
  const roomServer = createRoomServer({
    port: roomPort,
    root: path.join(ROOT, 'state', 'rooms'),
    aiName: character?.card?.name || '小鲸鱼',
    onMessage: (room, message) => roomAI?.observe(room, message),
    onAIEnabled: (room) => roomAI?.greet(room),
    logger
  });
  roomAI = createRoomAI({ roomServer, textRouter, character, asr, mediaBase: `http://127.0.0.1:${roomPort}`, aliases: config.role?.aliases || [], logger });
  roomServer.start().catch(() => {});
  const localChat = createLocalChat({ gateway, dispatch: dispatchMessage, media: mediaLibrary, history: localHistory, logger });

  gateway.on('message', (payload) => {
    dispatchMessage(gateway.normalize(payload)).catch((error) => logger.warn('message.dispatch_failed', { error: String(error?.message ?? error) }));
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

  let shutdownHandler = null;
  const handler = createPanelHandler({
    root: ROOT,
    config,
    configPath,
    logger,
    gateway,
    character,
    bilibili,
    mind,
    daydream,
    autonomy,
    storyStore,
    tasks,
    taskExecutor,
    actors,
    knowledge,
    slang,
    permissions,
    contacts,
    diary,
    milestones,
    textRouter,
    isConnected: () => connected,
    snapshot: snapshotState,
    health: healthState,
    metrics: metricsText,
    metricsJson: metricsState,
    dispatch: dispatchMessage,
    localChat,
    localHistory,
    mediaLibrary,
    screen,
    importQQStickers,
    capabilities,
    shutdownToken,
    shutdown: () => shutdownHandler?.()
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
    try { mind.markShutdown(); } catch {}
    try { runtimeLock.release(); } catch {}
    gateway.close();
    slangObserver.stop();
    knowledge?.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  };
  shutdownHandler = shutdown;
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return { gateway, server, actors, router: textRouter, config };
}
