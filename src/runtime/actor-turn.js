import { routeIncoming } from '../character/ingress.js';
import { buildNarrativePrompt } from '../story/prompt.js';
import { sanitizeReply, shadowReply } from '../core/reply.js';
import { chooseSticker } from '../character/expression.js';
import { matchSlang } from '../character/slang.js';
import { buildNotices } from './notices.js';
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
    if (current.images?.length && config.vision?.enabled !== false) {
      try {
        const described = await visionRouter.describe({ message: current });
        imageDesc = described.text;
        stats.imageCount += 1;
        metrics?.inc('qqbot_vision_requests_total', { provider: described.provider, outcome: 'ok' });
        logger.info('vision.described', { key, provider: described.provider, chars: imageDesc.length });
      } catch (error) {
        metrics?.inc('qqbot_vision_requests_total', { provider: 'unknown', outcome: 'error' });
        logger.warn('vision.failed', { key, error: String(error?.message ?? error) });
      }
    }
    let reference = '';
    let voiceDesc = '';
    if (current.voices?.length && asr) {
      try {
        voiceDesc = await asr.transcribe(current.segments);
        if (voiceDesc) {
          metrics?.inc('qqbot_asr_requests_total', { outcome: 'ok' });
          logger.info('asr.described', { key, chars: voiceDesc.length });
        }
      } catch (error) {
        metrics?.inc('qqbot_asr_requests_total', { outcome: 'error' });
        logger.warn('asr.failed', { key, error: String(error?.message ?? error) });
      }
    }
    if (knowledge) {
      const kb = knowledge.search(text, { limit: 2 });
      if (kb.lines.length) {
        reference = '资料：' + kb.lines.join('；').slice(0, 300);
        logger.info('character.knowledge', { key, count: kb.lines.length });
      }
    }
    const slangLines = matchSlang(text, slang);
    const slangBlock = slangLines.length ? `黑话：${slangLines.join('；')}` : '';
    let groupHistory = '';
    if (current.kind === 'group' && /群里|群消息|看看群|他们刚才|刚才.*(说|聊)/.test(text)) {
      try {
        const lines = await readGroupHistory({ gateway, groupId: current.id });
        if (lines.length) {
          groupHistory = `群里的原话：\n${lines.join('\n')}`;
          logger.info('group.history_read', { key, count: lines.length });
        }
      } catch (error) {
        logger.warn('group.history_failed', { key, error: String(error?.message ?? error) });
      }
    }
    if (!story) {
      logger.warn('story.missing', { key });
      return;
    }
    const lastUserIndex = scene.turns.map((t) => t.role).lastIndexOf('user');
    const promptTurns = scene.turns.map((turn, index) => {
      if (index !== lastUserIndex || (!imageDesc && !voiceDesc)) return turn;
      const seen = [imageDesc ? `[图片：${imageDesc}]` : '', voiceDesc ? `[语音：${voiceDesc}]` : ''].filter(Boolean).join(' ');
      return { ...turn, text: seen || turn.text };
    });
    const storyForPrompt = selectRelevantSlices(story, text);
    const prompt = buildNarrativePrompt({
      card: character.card,
      story: storyForPrompt,
      person,
      notices,
      turns: promptTurns,
      intent: scene.intent,
      notes: [
        groupHistory,
        reference,
        slangBlock,
        imageDesc ? `图片：${imageDesc}\n（这一轮有图，回应里自然带出你看到的内容，不要装作没看到）` : '',
        voiceDesc ? `语音：${voiceDesc}` : ''
      ],
      maxChars: character.maxChars
    });
    logger.info('character.actor_prompt', { key, chars: prompt.chars, story: true });
    let result;
    try {
      result = await textRouter.generate(prompt);
    } catch (error) {
      metrics?.inc('qqbot_errors_total', { area: 'model' });
      logger.error('turn.model_failed', { key, error: String(error?.message ?? error) });
      return;
    }
    const reply = sanitizeReply(result.text, Number(config.actor.maxReplyChars) || 160);
    if (!reply) {
      logger.info('turn.empty_reply', { key, provider: result.provider });
      return;
    }
    const expression = config.character?.expression ?? {};
    const canExpression = expression.enabled !== false
      && (!expression.privateOnly || current.kind === 'private')
      && Date.now() - (expressionCooldowns.get(key) || 0) >= Number(expression.cooldownMs || 600000);
    const sticker = canExpression ? chooseSticker(text, stickers) : null;
    if (current.dryRun) {
      character.director.recordReply(key, reply);
      logger.info('simulate.would_send', { key, kind: current.kind, provider: result.provider, text: reply, sticker: sticker?.desc ?? '' });
      return;
    }
    if (config.mode === 'shadow') {
      character.director.recordReply(key, reply);
      if (current.kind === 'group') groupCooldowns.set(key, Date.now());
      logger.info('shadow.would_send', { key, provider: result.provider, text: reply, sticker: sticker?.desc ?? '' });
      return;
    }
    try {
      const wantsVoice = Boolean(current.voices?.length) || /语音|声音|念一下|读一下|唱/.test(text);
      const ttsAllowed = tts
        && !(config.tts.privateOnly !== false && current.kind !== 'private')
        && wantsVoice;
      const delivery = await sendHumanReply({
        gateway,
        kind: current.kind,
        id: current.id,
        text: reply,
        sticker,
        tts,
        ttsAllowed,
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
      logger.info('turn.sent', { key, provider: result.provider, chars: deliveredReply.length, preview: deliveredReply.slice(0, 80), interrupted: delivery.interrupted });
    } catch (error) {
      metrics?.inc('qqbot_errors_total', { area: 'send' });
      logger.error('turn.send_failed', { key, error: String(error?.message ?? error) });
    }
  };
}
