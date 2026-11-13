import { routeIncoming } from '../character/ingress.js';

export async function selectCurrentMessage({ batch, key, tasks, taskExecutor, character, config, gateway, logger }) {
    let current = null;
    for (const msg of batch) {
      const route = routeIncoming(msg?.text);
      if (route.kind === 'task') {
        const task = tasks.add({ key, text: route.text, kind: route.kind, userId: msg.userId });
        logger.info('ingress.task_queued', { key, id: task?.id ?? null, chars: route.text.length });
        if (task && config.character.taskAutoRun === true) {
          taskExecutor.runPending({ limit: 1 }).catch((error) => logger.warn('task.auto_run_failed', { error: String(error?.message ?? error) }));
        }
        const ack = String(config.character.taskAck || '').trim();
        let ackSent = false;
        if (ack && config.mode === 'live' && (msg.kind === 'private' || config.character.taskAckGroups === true)) {
          try {
            await gateway.sendText(msg.kind, msg.id, ack);
            ackSent = true;
            logger.info('ingress.task_ack_sent', { key });
          } catch (error) {
            logger.warn('ingress.task_ack_failed', { key, error: String(error?.message ?? error) });
          }
        }
        if (ackSent) continue;
      }
      const decision = character.director.observe(msg);
      if (!decision.respond) {
        logger.info('character.skipped', { key, reason: decision.reason });
        continue;
      }
      current = msg;
    }

  return current;
}
