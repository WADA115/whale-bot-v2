import { chooseSticker } from '../character/expression.js';
import { sendHumanReply } from './speech.js';
import { shouldReflect } from '../story/reflect.js';

export async function deliverActorReply({
  config, current, character, text, stickers, expressionCooldowns, logger, key,
  stats, metrics, startedAt, gateway, reply, interrupted, storyEditor, story,
  notices, enqueueEditor, personId, scene, imageDesc, voiceDesc, groupCooldowns, provider
}) {
    const expression = config.character?.expression ?? {};
    const canExpression = expression.enabled !== false
      && (!expression.privateOnly || current.kind === 'private')
      && Date.now() - (expressionCooldowns.get(key) || 0) >= Number(expression.cooldownMs || 600000);
    const sticker = canExpression ? chooseSticker(text, stickers) : null;
    if (current.dryRun) {
      character.director.recordReply(key, reply);
      logger.info('simulate.would_send', { key, kind: current.kind, provider: provider, chars: reply.length, sticker: sticker?.desc ?? '' });
      return;
    }
    if (config.mode === 'shadow') {
      character.director.recordReply(key, reply);
      if (current.kind === 'group') groupCooldowns.set(key, Date.now());
      logger.info('shadow.would_send', { key, provider: provider, chars: reply.length, sticker: sticker?.desc ?? '' });
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
      metrics?.observe('qqbot_turn_duration_seconds', (Date.now() - startedAt) / 1000, { kind: current.kind });
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
      logger.info('turn.sent', { key, provider: provider, chars: deliveredReply.length, interrupted: delivery.interrupted });
    } catch (error) {
      metrics?.inc('qqbot_errors_total', { area: 'send' });
      logger.error('turn.send_failed', { key, error: String(error?.message ?? error) });
    }

}
