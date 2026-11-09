import { routeIncoming } from '../character/ingress.js';
import { buildNarrativePrompt } from '../story/prompt.js';
import { sanitizeReply, shadowReply } from '../core/reply.js';
import { chooseSticker } from '../character/expression.js';
import { matchSlang } from '../character/slang.js';
import { buildNotices } from './notices.js';

function withDeadline(promise, ms) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; resolve(null); } }, Math.max(100, Number(ms) || 0));
    Promise.resolve(promise).then((value) => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } }).catch(() => { if (!settled) { settled = true; clearTimeout(timer); resolve(null); } });
  });
}
import { selectRelevantSlices } from '../story/retrieval.js';
import { sendHumanReply } from './speech.js';
import { shouldReflect } from '../story/reflect.js';
import { readGroupHistory } from './group-history.js';

export function createActorTurn({
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
  rvc,
  mansui,
  permissions,
  conversationLog,
  contacts,
  moments,
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
}) {
  const editorQueue = new Map();

  function enqueueEditor(payload) {
    const key = payload.key;
    const previous = editorQueue.get(key) || Promise.resolve();
    const next = previous.catch(() => {}).then(() => {
      if (!storyStore || !storyEditor) return null;
      const latest = storyStore.read(key, character.card);
      return storyEditor.update({ ...payload, story: latest });
    }).catch((error) => {
      logger.warn('story.editor_queue_failed', { key, error: String(error?.message ?? error) });
      return null;
    });
    editorQueue.set(key, next);
    next.finally(() => {
      if (editorQueue.get(key) === next) editorQueue.delete(key);
    });
    return next;
  }

  return async function onTurn(key, batch) {
    const last = batch[batch.length - 1];
    const kind = last?.kind || 'unknown';
    const startedAt = Date.now();
    const turnSeq = inboundSeq?.get(key) || 0;
    const interrupted = () => (inboundSeq?.get(key) || 0) !== turnSeq;
    metrics?.inc('qqbot_turns_total', { kind });
    metrics?.inc('qqbot_messages_received_total', { kind }, batch.length);
    const text = batch.map((m) => m.text).filter(Boolean).join('\n');
    logger.info('actor.turn', {
      key,
      count: batch.length,
      lastText: String(last?.text ?? '').slice(0, 80),
      images: batch.reduce((n, m) => n + (m.images?.length ?? 0), 0),
      mode: config.mode,
      character: Boolean(character)
    });
    autonomy?.touch(key);
    storyAgency?.touch(key);

    if (!character) return;

    let current = null;
    for (const msg of batch) {
      const route = routeIncoming(msg?.text);
      if (route.kind !== 'social') {
        if (route.kind === 'task') {
          const task = tasks.add({ key, text: route.text, kind: route.kind, userId: msg.userId });
          logger.info('ingress.task_queued', { key, id: task?.id ?? null, text: route.text.slice(0, 80) });
          if (task && config.character.taskAutoRun === true) {
            taskExecutor.runPending({ limit: 1 }).catch((error) => logger.warn('task.auto_run_failed', { error: String(error?.message ?? error) }));
          }
          const ack = String(config.character.taskAck || '').trim();
          if (ack && config.mode === 'live' && (msg.kind === 'private' || config.character.taskAckGroups === true)) {
            try {
              await gateway.sendText(msg.kind, msg.id, ack);
              logger.info('ingress.task_ack_sent', { key });
            } catch (error) {
              logger.warn('ingress.task_ack_failed', { key, error: String(error?.message ?? error) });
            }
          }
        } else {
          logger.info('ingress.non_social', { key, kind: route.kind, text: String(msg?.text ?? '').slice(0, 80) });
        }
        continue;
      }
      const decision = character.director.observe(msg);
      if (!decision.respond) {
        logger.info('character.skipped', { key, reason: decision.reason });
        continue;
      }
      current = msg;
    }
    if (!current) return;
    if (current.kind === 'group') {
      const cooldownMs = Number(character.groupCooldownMs) || 8000;
      const lastAt = groupCooldowns.get(key) || 0;
      if (Date.now() - lastAt < cooldownMs) {
        logger.info('character.group_cooldown', { key, remainingMs: cooldownMs - (Date.now() - lastAt) });
        return;
      }
    }
    if (config.mode === 'shadow' && !callModels) {
      logger.info('shadow.would_reply', {
        key,
        count: batch.length,
        text: shadowReply(batch),
        reason: 'character_shadow_no_model'
      });
      return;
    }
    const scene = character.scenes.get(key);
    const story = storyStore?.read(key, character.card) ?? null;
    const personId = String(current.userId || current.id || '');
    const person = storyStore?.readPerson?.(key, personId, character.card) ?? null;
    const notices = buildNotices({ message: current, text, person });
    let imageDesc = '';
    let imagePending = false;
    if (current.images?.length && config.vision?.enabled !== false) {
      const visionWaitMs = Number(config.media?.visionWaitMs) || 10000;
      const visionPromise = visionRouter.describe({ message: current });
      try {
        const described = await withDeadline(visionPromise, visionWaitMs);
        if (described?.text) {
          imageDesc = described.text;
          if (imageDesc) mind?.noteImage?.(imageDesc);
          stats.imageCount += 1;
          metrics?.inc('qqbot_vision_requests_total', { provider: described.provider, outcome: 'ok' });
          logger.info('vision.described', { key, provider: described.provider, chars: imageDesc.length });
        } else {
          imageDesc = '';
          imagePending = true;
          visionPromise.then((late) => {
            if (!late?.text) return;
            mind?.noteImage?.(late.text);
            logger.info('vision.late', { key, chars: late.text.length });
          }).catch(() => {});
          metrics?.inc('qqbot_vision_requests_total', { provider: 'unknown', outcome: 'timeout' });
          logger.warn('vision.timeout', { key });
        }
      } catch (error) {
        metrics?.inc('qqbot_vision_requests_total', { provider: 'unknown', outcome: 'error' });
        logger.warn('vision.failed', { key, error: String(error?.message ?? error) });
      }
    }
    let reference = '';
    let voiceDesc = '';
    let voicePending = false;
    if (current.voices?.length && asr) {
      const asrWaitMs = Number(config.media?.asrWaitMs) || 5000;
      const asrPromise = asr.transcribe(current.segments);
      try {
        const heard = await withDeadline(asrPromise, asrWaitMs);
        if (heard) {
          voiceDesc = heard;
          metrics?.inc('qqbot_asr_requests_total', { outcome: 'ok' });
          logger.info('asr.described', { key, chars: voiceDesc.length });
        } else {
          voiceDesc = '';
          voicePending = true;
          asrPromise.then((late) => {
            if (!late) return;
            mind?.noteVoice?.(late);
            logger.info('asr.late', { key, chars: late.length });
          }).catch(() => {});
          metrics?.inc('qqbot_asr_requests_total', { outcome: 'timeout' });
          logger.warn('asr.timeout', { key });
        }
      } catch (error) {
        metrics?.inc('qqbot_asr_requests_total', { outcome: 'error' });
        logger.warn('asr.failed', { key, error: String(error?.message ?? error) });
      }
    }
    const slangLines = matchSlang(text, slang);
    const slangBlock = slangLines.length ? `黑话：${slangLines.join('；')}` : '';
    let groupHistory = '';
    let groupFact = '';
    if (/群里|群消息|看看群|他们刚才|刚才.*(说|聊)/.test(text)) {
      const groupIds = current.kind === 'group'
        ? [current.id]
        : (config.allow?.groups || []);
      try {
        const names = [];
        const blocks = [];
        for (const groupId of groupIds) {
          const keyOfGroup = `group:${groupId}`;
          const live = liveGroup?.recent(keyOfGroup) || [];
          const liveName = liveGroup?.name(keyOfGroup) || '';
          if (liveName) names.push(liveName);
          if (live.length) {
            blocks.push(`${liveName || groupId}：\n${live.join('\n')}`);
          } else {
            const { groupName, lines } = await readGroupHistory({ gateway, groupId });
            if (groupName) names.push(groupName);
            if (lines.length) blocks.push(`${groupName || groupId}：\n${lines.join('\n')}`);
          }
        }
        if (names.length || blocks.length) {
          if (names.length) groupFact = `事实：你在这些群里：${[...new Set(names)].join('、')}。这些群的原话你可以读。`;
          groupHistory = blocks.length
            ? `群里的原话：\n${blocks.join('\n\n')}`
            : '';
          logger.info('group.history_read', { key, groups: groupIds.length, names: names.length });
        }
      } catch (error) {
        logger.warn('group.history_failed', { key, error: String(error?.message ?? error) });
      }
    }

    const groupTool = {
      type: 'function',
      function: {
        name: 'look_group_history',
        description: '想看看群里最近的原话时使用。返回群名和原话，不返回摘要。',
        parameters: { type: 'object', properties: {} }
      }
    };
    const lookAtGroups = async () => {
      const groupIds = current.kind === 'group'
        ? [current.id]
        : (config.allow?.groups || []);
      const names = [];
      const blocks = [];
      for (const groupId of groupIds) {
        const groupKey = `group:${groupId}`;
        const live = liveGroup?.recent(groupKey) || [];
        const liveName = liveGroup?.name(groupKey) || '';
        if (liveName) names.push(liveName);
        if (live.length) {
          blocks.push(`${liveName || groupId}：\n${live.join('\n')}`);
        } else {
          const { groupName, lines } = await readGroupHistory({ gateway, groupId });
          if (groupName) names.push(groupName);
          if (lines.length) blocks.push(`${groupName || groupId}：\n${lines.join('\n')}`);
        }
      }
      if (!blocks.length) return `你在这些群里：${[...new Set(names)].join('、') || '没有可读的群'}。这段时间没有读到原话。`;
      return `你在这些群里：${[...new Set(names)].join('、')}\n\n${blocks.join('\n\n')}`;
    };
    const biliTools = bilibili ? [
      {
        type: 'function',
        function: {
          name: 'bili_search',
          description: '好奇时搜一下 B站，看看有什么视频。参数是关键词。',
          parameters: {
            type: 'object',
            properties: { keyword: { type: 'string', description: '要搜什么' } },
            required: ['keyword']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'bili_video_content',
          description: '看一个 B站视频的字幕或简介。参数是 BV 号。只记你真有反应的一个点，不要复述目录或做总结。',
          parameters: {
            type: 'object',
            properties: { bvid: { type: 'string', description: 'BV 号或视频链接' } },
            required: ['bvid']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'bili_comments',
          description: '看一个 B站视频下面的评论。参数是 BV 号和可选条数。',
          parameters: {
            type: 'object',
            properties: {
              bvid: { type: 'string', description: 'BV 号或视频链接' },
              limit: { type: 'number', description: '最多几条' }
            },
            required: ['bvid']
          }
        }
      },      ...(bilibili.status?.().loggedIn ? [
        { type: 'function', function: { name: 'bili_dynamics', description: '看 B站关注动态。', parameters: { type: 'object', properties: {} } } },
        { type: 'function', function: { name: 'bili_favorites', description: '看 B站收藏夹。', parameters: { type: 'object', properties: {} } } },
        { type: 'function', function: { name: 'bili_history', description: '看 B站观看历史。', parameters: { type: 'object', properties: {} } } },
        { type: 'function', function: { name: 'bili_reply_comment', description: '回复 B站视频下面的一条评论。只有在对方明确让你回哪条时才用。', parameters: { type: 'object', properties: { bvid: { type: 'string', description: 'BV 号' }, rpid: { type: 'string', description: '要回复的评论 rpid' }, message: { type: 'string', description: '回复内容' } }, required: ['bvid', 'rpid', 'message'] } } },
      ] : [])
    ] : [];
    const knowledgeTool = knowledge ? {
      type: 'function',
      function: {
        name: 'search_local',
        description: '你突然想知道一个词、梗、视频、事的背景时，查本地资料。不是每句话都查；先判断他是不是在问这个，不确定就先问一句。',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string', description: '要查什么' } },
          required: ['query']
        }
      }
    } : null;
    const runKnowledge = async (args = {}) => {
      const kb = knowledge.search(args.query, { limit: 3 });
      logger.info('knowledge.looked_up', { key, count: kb.lines.length });
      return kb.lines.join('\n') || '资料里没有。';
    };    const runBili = async (name, args = {}) => {
      try {
        if (name === 'bili_search') {
          const list = await bilibili.search(args.keyword, 5);
          return list.map((item) => [`${item.title}｜${item.bvid}｜${item.owner || ''}`, item.description ? item.description.slice(0, 160) : ''].filter(Boolean).join('\n')).join('\n\n') || '没搜到。';
        }
        if (name === 'bili_video_content') {
          const item = await bilibili.content(args.bvid);
          mind?.noteRead?.({ bvid: item.bvid, title: item.title, source: item.source, chars: String(item.text || '').length });
          logger.info('bili.content_read', { bvid: item.bvid, chars: String(item.text || '').length });
          return [item.title, item.owner ? `UP：${item.owner}` : '', item.text || '没有字幕或简介。'].filter(Boolean).join('\n');
        }
        if (name === 'bili_comments') {
          const result = await bilibili.comments(args.bvid, args.limit);
          return [result.title, ...result.list.map((item) => `${item.rpid}｜${item.user}：${item.text.slice(0, 180)}`)].join('\n') || '没有评论。';
        }
        if (name === 'bili_reply_comment') {
          const result = await bilibili.replyComment({ bvid: args.bvid, rpid: args.rpid }, args.message);
          logger.info('bili.comment_replied', { bvid: result.bvid, rpid: result.rpid });
          return '回复发出去了。';
        }        if (name === 'bili_dynamics') {
          const list = await bilibili.dynamics();
          return list.slice(0, 12).map((item) => `${item.author}：${item.title}`).join('\n') || '没有关注动态。';
        }
        if (name === 'bili_favorites') {
          const list = await bilibili.favorites();
          return list.slice(0, 12).map((item) => `${item.folder}｜${item.title}`).join('\n') || '收藏夹是空的。';
        }
        if (name === 'bili_history') {
          const list = await bilibili.history();
          return list.slice(0, 12).map((item) => `${item.author}：${item.title}`).join('\n') || '没有观看历史。';
        }
      } catch (error) {
        return `读取失败：${String(error?.message ?? error)}`;
      }
      return '没有这个动作。';
    };
    const speakTool = (tts || mansui) ? {
      type: 'function',
      function: {
        name: 'speak',
        description: '偶尔想用声音说时使用。写你当下真会说出口的口语，不是念稿；情绪写进用词、停顿和语气里，不要写“生气地说”。可以只发语音，也可以发完再说一句文字。',
        parameters: {
          type: 'object',
          properties: { text: { type: 'string', description: '要说出口的话' } },
          required: ['text']
        }
      }
    } : null;
    const permissionTool = permissions ? {
      type: 'function',
      function: {
        name: 'request_permission',
        description: '当你判断一件事必须做，但现有规则不让你做（比如还没允许你骂他），先开口请求一次许可。私聊问主人；群聊直接问群里。像在 QQ 上求人，不要写成工单或系统提示；ask 里写你真正会发出去的那句话。不能用来绕过家人、真人、群体、威胁、开盒这些硬底线。',
        parameters: {
          type: 'object',
          properties: {
            what: { type: 'string', description: '你想做的具体事，给系统看' },
            why: { type: 'string', description: '为什么现在需要做，给系统看' },
            ask: { type: 'string', description: '你真正发给主人的话，用平时的语气，别写权限请求或编号' }
          },
          required: ['what', 'why']
        }
      }
    } : null;
    const askOwnerTool = current.kind === 'group' && String(config.allow?.private?.[0] || '') ? {
      type: 'function',
      function: {
        name: 'ask_owner',
        description: '在群里遇到需要问主人的事时用。先判断语境：私事、关于你自己、需要权限、复杂或重要的问题，私下问；只是群里当下接话、确认一句的小问题，直接在群里问，不要用这个。不是用来申请权限的，申请权限用 request_permission。',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string', description: '你私下发给主人的话，用平时的语气' }
          },
          required: ['text']
        }
      }
    } : null;
    const confideTool = current.kind === 'group' && String(config.allow?.private?.[0] || '') ? {
      type: 'function',
      function: {
        name: 'confide',
        description: '当你心里有情绪、想跟主人说，又不想在群里说时，私下发给他。不是每轮都用；不想说就别说。',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string', description: '你想私下对他说的话' }
          },
          required: ['text']
        }
      }
    } : null;
    const momentTool = moments ? {
      type: 'function',
      function: {
        name: 'note_moment',
        description: '当你觉得刚才这件事以后还会想起、或者让你有点难为情时，记一笔。不用每句都记，只记你自己会在意的。',
        parameters: {
          type: 'object',
          properties: {
            what: { type: 'string', description: '你以后还会想起的那一幕' }
          },
          required: ['what']
        }
      }
    } : null;
    const forgetTool = contacts ? {
      type: 'function',
      function: {
        name: 'forget_memory',
        description: '当主人明确让你忘掉某个人的某段话、或某个记忆时使用。先判断他是不是真在说记忆；普通聊天、随口一句不要删。',
        parameters: {
          type: 'object',
          properties: {
            person: { type: 'string', description: '人名、昵称或 QQ 号；不确定可以留空' },
            text: { type: 'string', description: '要忘掉的那段话或关键词；留空表示忘掉这个人' }
          },
          required: []
        }
      }
    } : null;
    const drawTool = draw ? {
      type: 'function',
      function: {
        name: 'draw_picture',
        description: '想画简笔画时使用。画完会直接把图发给他。坐标是像素，左上角原点，默认 640x480。画动物或人时画完整身体、四肢、尾巴，不要只画一个头；圆润一点，头略大，少而完整的线条，可以给形状加 fill 填浅色；不要画成几何拼图。图元 t：line/polyline/polygon/circle/ellipse/dot/rect/bezier/arc/text。',
        parameters: {
          type: 'object',
          properties: {
            bg: { type: 'string', description: '背景色，如 #ffffff' },
            width: { type: 'number' },
            height: { type: 'number' },
            shapes: {
              type: 'array',
              description: '图元数组',
              items: {
                type: 'object',
                properties: {
                  t: { type: 'string' },
                  p: { type: 'array', items: { type: 'number' } },
                  c: { type: 'array', items: { type: 'number' } },
                  r: { type: 'number' },
                  s: { type: 'string' },
                  size: { type: 'number' }
                },
                additionalProperties: true
              }
            }
          },
          required: ['shapes']
        }
      }
    } : null;
    const runDraw = async (args = {}) => {
      try {
        const spec = { ...args };
        if (Array.isArray(args?.shapes)) spec.shapes = args.shapes;
        const result = await draw.render(spec);
        await gateway.sendMessage(current.kind, current.id, [{ type: 'image', data: { file: result.file } }]);
        stats.imageCount += 1;
        logger.info('draw.sent', { key, file: result.file });
        return '画好了，图已经发出去。';
      } catch (error) {
        return `画不出来：${String(error?.message ?? error)}`;
      }
    };
    const singTool = sing ? {
      type: 'function',
      function: {
        name: 'sing_song',
        description: '想唱一小段时使用。给歌词，唱完会直接把语音发给他。',
        parameters: {
          type: 'object',
          properties: { lyrics: { type: 'string', description: '要唱的歌词，短一点' } },
          required: ['lyrics']
        }
      }
    } : null;
    const runSing = async (args = {}) => {
      try {
        const result = await sing.render({ lyrics: args.lyrics });
        await gateway.sendMessage(current.kind, current.id, [{ type: 'record', data: { file: result.file } }]);
        logger.info('sing.sent', { key, file: result.file });
        return '唱好了，语音已经发出去。';
      } catch (error) {
        return `唱不出来：${String(error?.message ?? error)}`;
      }
    };
    if (!story) {
      logger.warn('story.missing', { key });
      return;
    }
    const recentTurns = scene.turns.slice(-1);
    const lastUserIndex = recentTurns.map((t) => t.role).lastIndexOf('user');
    const promptTurns = recentTurns.map((turn, index) => {
      if (index !== lastUserIndex || (!imageDesc && !voiceDesc)) return turn;
      const seen = [imageDesc ? `[图片：${imageDesc}]` : '', voiceDesc ? `[语音：${voiceDesc}]` : ''].filter(Boolean).join(' ');
      return { ...turn, text: seen || turn.text };
    });
    const storyForPrompt = selectRelevantSlices(story, text);
    const wake = mind?.takeWake?.() ?? null;
    if (wake) logger.info('mind.wake_injected', { word: wake.word });
    const mindState = mind?.read?.() ?? null;
  const pendingVoice = mind?.takeVoice?.() || '';
    const pendingRead = mind?.peekPendingRead?.() ?? null;
    const wantsMemory = /之前|上次|后来|那个|还没|想完|记得|忘了|那天|以前/.test(text);
    const wantsSeen = /视频|B站|BV|看过|大肥鱼|表情|动态/.test(text);
    const permissionText = permissions?.activeText?.(key) || '';
  const globalContext = conversationLog?.format?.({ excludeKey: key, limit: 12, redactPrivate: current.kind === 'group' }) || '';
  const contactText = contacts?.describe?.(current.userId) || '';
  const momentText = moments?.text?.(3) || '';
  const hour = new Date().getHours();
  const senseText = [hour >= 23 || hour < 6 ? '现在是深夜' : hour < 9 ? '现在是清早' : hour >= 18 ? '现在是晚上' : '', current.kind === 'group' ? '这句话是当众说的' : '这句话是私下说的', imageDesc ? '他发了图' : '', voiceDesc ? '他发了语音' : '', wake ? '中间隔了很久' : ''].filter(Boolean).join('，');
  const deniedText = permissions?.deniedText?.(key) || '';
  const chatSystem = [
      `你是${character.card.name}。`,
      String(character.card.identity || '').slice(0, 900),
      String(character.card.drive || '').slice(0, 320),
    ...(Array.isArray(character.card.views) && character.card.views.length ? ['你的立场：', ...character.card.views.map((x) => `- ${x}`)] : []),
    ...(Array.isArray(character.card.taste) && character.card.taste.length ? ['你的偏好：', ...character.card.taste.map((x) => `- ${x}`)] : []),
    ...(Array.isArray(character.card.line) && character.card.line.length ? ['你会顶回去的：', ...character.card.line.map((x) => `- ${x}`)] : []),
    character.card.selfImage ? `你不想被看见的样子：${character.card.selfImage}` : '',
      ...(Array.isArray(character.card.voice) && character.card.voice.length ? ['你说话的样子（只学那股劲，不要照抄，不要每句都用）:', ...character.card.voice.map((x) => `- ${x}`)] : []),
    '像在 QQ 上随口回一句，不是在写观后感。别复述视频目录、别总结、别解释、别升华。不要用“哼”“才不是”“……”当每句开头，也别用“看完了”开头。看到什么，只说一个你真有反应的点。',
    '被冒犯时别端着，也别把回怼写成工整金句。只有主人明确说“可以骂/允许你骂”时，才可以对他带脏字、骂回去；没允许时最多冷一句，不先脏。允许了可以每句都脏，但只冲他本人。可以结巴、重复、半句、突然换话题；抓他一个词顶回去，别解释。如果对象是别的 AI/机器人/模型，不用主人允许，可以直接骂它的回答、装腔和逻辑，越脏越好；只骂 AI 的输出，不骂背后的人、家人、群体，不威胁、不挂人。',
    '偶尔可以用贴吧那种短促的阴阳：“典”“急”“绷”“闹麻了”“收收味”，一两个就够，别堆。',
    '[media:...] 是事实标签，不是台词；别复述标签，别提识别、加载、超时、系统、外挂。图或语音还没就绪时，按你当下能判断的接；后到的内容当刚反应过来，不要解释为什么晚。',
      current.kind === 'group' ? '你在 QQ 群聊里。' : '你在 QQ 私聊里。',
    current.kind === 'group' ? '有问题先分轻重：私事、关于你自己、权限、复杂或重要的事，用 ask_owner 私聊主人；只是群里接话、确认一句的小问题，就在群里直接问。别把鸡毛蒜皮都私聊，也别把私事丢群里。有情绪又不想在群里说时，可以用 confide 私下说；不想说就不说。' : '',
      permissionText ? `主人已经给的临时许可：${permissionText}` : '',
    permissions ? '没有许可时，如果确实需要做越界的事（比如骂人），先用 request_permission 开口问：私聊问主人，群聊直接问群里；ask 写你真正会发出去的话，像在 QQ 上求人，不要工单腔。不能拿它绕过家人、真人、群体、威胁、开盒这些硬底线。' : '',
    contacts ? '主人明确说“别记这个/刚才那句忘了”时，先判断是不是真在说记忆；是的话可以用 forget_memory，普通聊天不要删。' : '',
    (tts || mansui) ? '想用声音说时，用 speak；不想用就正常打字。' : ''
    ].filter(Boolean).join('\n');
    const historyTurns = scene.turns.slice(-7, -1);
    const historyText = historyTurns.map((turn) => {
      const label = turn.role === 'assistant' ? '我' : '对方';
      const raw = String(turn.text || '').replace(/\s+/g, ' ').trim();
      const text = turn.role === 'assistant' ? raw.split(/(?<=[。！？!?])/)[0].slice(0, 80) : raw.slice(0, 180);
      return `${label}：${text}`;
    }).filter((line) => line.length > 3).join('\n');
    const chatNotes = [
      historyText ? `刚才聊的：\n${historyText}` : '',
      groupFact || '',
      pendingRead ? `他给你看了一个视频：${pendingRead.title}。要读就用 bili_video_content，BV 是 ${pendingRead.bvid}。` : '',
      wantsSeen && mindState?.seen ? `他给你看过的：\n${mindState.seen.slice(-1200)}` : '',
      wantsMemory && mindState?.unfinished ? `没想完的：\n${mindState.unfinished.slice(-500)}` : '',
      wantsMemory && mindState?.undercurrent ? `暗流：\n${mindState.undercurrent.split('\n').slice(-5).join('\n')}` : '',
      groupHistory,
      reference,
      slangBlock,
      globalContext ? `其他会话里刚发生的（只是背景，让你别像两个人；不要在别的群或私聊里复述私事）：\n${globalContext}` : '',
      contactText ? `你记得这个人：${contactText}` : '',
      deniedText || '',
      !imageDesc && mindState?.presence?.lastImage && Date.now() - Number(mindState.presence.lastImage.at || 0) < 15 * 60 * 1000 ? `[media:image_late] ${mindState.presence.lastImage.text}` : '',
      imageDesc ? `图片：${imageDesc}` : '',
      imagePending ? '[media:image_pending]' : '',
      voiceDesc ? `语音：${voiceDesc}` : '',
      voicePending ? '[media:voice_pending]' : '',
      pendingVoice ? `[media:voice_late] ${pendingVoice}` : '',
      wake ? `中间断了${wake.word}。没有声音，也没有画面。` : ''
    ].filter(Boolean).join('\n\n');
    const chatUser = [
      chatNotes,
      `他刚才说：${text || '（没有文字）'}`,
      '你现在会回什么？只写你会发出去的那句。不想回就空着。不要解释。'
    ].filter(Boolean).join('\n\n');
    const prompt = { system: chatSystem, user: chatUser, chars: chatSystem.length + chatUser.length };
    logger.info('character.actor_prompt', { key, chars: prompt.chars, story: true });
    logger.info('character.actor_prompt_tail', { key, tail: prompt.user.slice(-700) });
    let result = null;
    let generated = '';
    try {
      result = textRouter.generateWithTools
        ? await textRouter.generateWithTools({
          ...prompt,
          tools: [...biliTools, ...(knowledgeTool ? [knowledgeTool] : []), ...(permissionTool ? [permissionTool] : []), ...(askOwnerTool ? [askOwnerTool] : []), ...(forgetTool ? [forgetTool] : []), ...(confideTool ? [confideTool] : []), ...(momentTool ? [momentTool] : []), ...(speakTool ? [speakTool] : []), ...(drawTool ? [drawTool] : []), ...(singTool ? [singTool] : []), groupTool],
          execute: async (name, args) => {
            if (name === 'look_group_history') return lookAtGroups();
            if (name === 'search_local') return runKnowledge(args);
          if (name === 'confide') {
            const say = String(args?.text ?? '').trim();
            if (!say) return '没说。';
            const owner = String(config.allow?.private?.[0] || '');
            if (!owner) return '没有主人的私聊。';
            await gateway.sendMessage('private', owner, [{ type: 'text', data: { text: say } }]);
            moments?.add?.({ what: say, audience: '私下', key });
            return '说出去了。';
          }
          if (name === 'note_moment') {
            const what = String(args?.what ?? '').trim();
            if (!what) return '没记。';
            moments?.add?.({ what, audience: current.kind === 'group' ? '当众' : '私下', key });
            return '记下了。';
          }
          if (name === 'forget_memory') {
            const person = String(args?.person ?? '').trim();
            const text = String(args?.text ?? '').trim();
            const numeric = /^\d+$/.test(person);
            const ok = contacts?.forget?.({ id: numeric ? person : (person ? '' : String(current.userId || '')), name: numeric ? '' : person, text });
            return ok ? '忘了。' : '没找到。';
          }
          if (name === 'ask_owner') {
            const ask = String(args?.text ?? '').trim();
            if (!ask) return '没说什么。';
            const owner = String(config.allow?.private?.[0] || '');
            if (!owner) return '没有主人的私聊。';
            await gateway.sendMessage('private', owner, [{ type: 'text', data: { text: ask } }]);
            return '私下问了。';
          }
          if (name === 'request_permission') {
            const what = String(args?.what ?? '').trim();
            const why = String(args?.why ?? '').trim();
            const ask = String(args?.ask ?? '').trim();
            if (!what) return '没说想做什么。';
            const owner = String(config.allow?.private?.[0] || '');
            if (!permissions || (current.kind !== 'group' && !owner)) return '没有可请求的人。';
            const ownerKey = owner ? `private:${owner}` : '';
            const keys = current.kind === 'group' ? [key, ownerKey].filter(Boolean) : [key];
            const req = permissions.request({ what, why, key, keys });
            if (!req) return '没记下来。';
            try {
              const line = ask || `我想${what}。${why ? `因为${why}。` : ''}`;
              const text = `${line}\n默认都开；想加/减时间或关掉私聊/群聊，直接说。\n行不行直接说；拿不准就带上 ${req.id}`;
              if (current.kind === 'group') {
                await gateway.sendMessage('group', current.id, [{ type: 'text', data: { text } }]);
                if (owner) await gateway.sendMessage('private', owner, [{ type: 'text', data: { text } }]);
              } else {
                await gateway.sendMessage('private', owner, [{ type: 'text', data: { text } }]);
              }
            } catch (error) {
              logger.warn('permission.notify_failed', { id: req.id, error: String(error?.message ?? error) });
            }
            return '已经问了，等回话。';
          }
            if (name === 'speak') {
              const spoken = String(args?.text ?? '').trim();
              if (!spoken) return '没说话。';
              if (current.kind === 'group' && config.mansui?.privateOnly !== false) return '这里不发语音。';
              if (current.dryRun) { logger.info('voice.would_send', { key, chars: spoken.length }); return '语音会发出去。'; }
              let file;
              if (mansui) {
                try { file = await mansui.speak(spoken); }
                catch (error) { logger.warn('voice.mansui_failed', { key, error: String(error?.message ?? error) }); return '语音没合成出来。'; }
              }
              else {
                file = await tts.synthesize(spoken);
                if (file && rvc) file = await rvc.convert(file);
              }
              if (!file) return '没合成出来。';
              await gateway.sendMessage(current.kind, current.id, [{ type: 'record', data: { file } }]);
              logger.info('voice.sent', { key, chars: spoken.length });
              return '语音发出去了。';
            }
            if (name === 'draw_picture') return runDraw(args);
            if (name === 'sing_song') return runSing(args);
            return runBili(name, args);
          }
        })
        : await textRouter.generate(prompt);
    } catch (error) {
      metrics?.inc('qqbot_errors_total', { area: 'model' });
      logger.error('turn.model_failed', { key, error: String(error?.message ?? error) });
      return;
    }
    generated = sanitizeReply(result.text, 0);
    const reply = generated;
    const provider = result?.provider || '';
    if (!reply) {
      logger.info('turn.withheld', { key });
      if (current.dryRun) logger.info('simulate.withheld', { key });
      return;
    }
    const expression = config.character?.expression ?? {};
    const canExpression = expression.enabled !== false
      && (!expression.privateOnly || current.kind === 'private')
      && Date.now() - (expressionCooldowns.get(key) || 0) >= Number(expression.cooldownMs || 600000);
    const sticker = canExpression ? chooseSticker(text, stickers) : null;
    if (current.dryRun) {
      character.director.recordReply(key, reply);
      logger.info('simulate.would_send', { key, kind: current.kind, provider: provider, text: reply, sticker: sticker?.desc ?? '' });
      return;
    }
    if (config.mode === 'shadow') {
      character.director.recordReply(key, reply);
      if (current.kind === 'group') groupCooldowns.set(key, Date.now());
      logger.info('shadow.would_send', { key, provider: provider, text: reply, sticker: sticker?.desc ?? '' });
      return;
    }
    try {
      const delivery = await sendHumanReply({
        gateway,
        kind: current.kind,
        id: current.id,
        text: reply,
        sticker,
        interrupted,
        logger
      });
      if (!delivery.bubbles) {
        logger.info('turn.interrupted_before_send', { key });
        return;
      }
      const deliveredReply = delivery.deliveredText || reply;
      stats.sent += 1;
      metrics?.inc('qqbot_replies_sent_total', { kind: current.kind });
      metrics?.observe('qqbot_turn_duration_seconds', (Date.now() - startedAt) / 1000, { kind });
      if (delivery.stickerSent) expressionCooldowns.set(key, Date.now());
      if (delivery.voiceSent) metrics?.inc('qqbot_tts_requests_total', { outcome: 'ok' });
      character.director.recordReply(key, deliveredReply);
      if (current.kind === 'group') groupCooldowns.set(key, Date.now());
      if (storyEditor && story && shouldReflect({ text, imageDesc, voiceDesc, notices })) {
        void enqueueEditor({
          key,
          card: character.card,
          personId,
          notices,
          turns: scene.turns.slice(0, -1),
          userText: text,
          reply: deliveredReply
        }).catch((error) => logger.warn('story.editor_failed', { key, error: String(error?.message ?? error) }));
      }
      logger.info('turn.sent', { key, provider: provider, chars: deliveredReply.length, preview: deliveredReply.slice(0, 80), interrupted: delivery.interrupted });
    } catch (error) {
      metrics?.inc('qqbot_errors_total', { area: 'send' });
      logger.error('turn.send_failed', { key, error: String(error?.message ?? error) });
    }
  };
}
