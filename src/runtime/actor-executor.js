import { runBiliAction } from './actor-bili.js';
export function createToolExecutor({ lookAtGroups, runKnowledge, config, gateway, moments, milestones, current, screen, visionRouter, logger, key, diaryEntries, diary, contacts, permissions, mansui, tts, rvc, rvcLimiter, runDraw, runSing, bilibili, mind, writeGate }) {
  return async function execute(name, args) {

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
          if (name === 'remember_milestone') {
            const what = String(args?.what ?? '').trim();
            if (!what) return '没记。';
            milestones?.add?.({ what, who: String(current.senderName || current.userId || ''), key });
            return '记下了。';
          }
          if (name === 'look_screen') {
            if (!screen?.isEnabled?.()) return '[screen:disabled]';
            try {
              const file = screen.frame ? await screen.frame() : await screen.capture();
              const described = await visionRouter.describe({ message: { segments: [{ type: 'image', data: { file } }] } });
              return described?.text ? `屏幕：${described.text}` : '[screen:unreadable]';
            } catch (error) {
              logger.warn('screen.failed', { key, error: String(error?.message ?? error) });
              return '[screen:failed]';
            }
          }
          if (name === 'read_diary') {
            const date = String(args?.date ?? '').trim();
            const query = String(args?.query ?? '').trim().toLowerCase();
            let hits = diaryEntries.slice();
            if (date) hits = hits.filter((item) => String(item.date || new Date(Number(item.at) || Date.now()).toLocaleDateString('sv-SE')) === date);
            if (query) hits = hits.filter((item) => String(item.text || '').toLowerCase().includes(query));
            if (!hits.length) return '日记里没有。';
            return hits.slice(-6).map((item) => {
              const d = item.date || new Date(Number(item.at) || Date.now()).toLocaleDateString('sv-SE');
              return `${d}\n${item.text}`;
            }).join('\n\n');
          }
          if (name === 'write_diary') {
            const text = String(args?.text ?? '').trim();
            if (!text) return '没写。';
            diary?.add?.({ text });
            return '写下来了。';
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
            if (!ask) return '没有 ask，未发送。';
            const owner = String(config.allow?.private?.[0] || '');
            if (!permissions || (current.kind !== 'group' && !owner)) return '没有可请求的人。';
            const ownerKey = owner ? `private:${owner}` : '';
            const keys = current.kind === 'group' ? [key, ownerKey].filter(Boolean) : [key];
            const req = permissions.request({ what, why, key, keys });
            if (!req) return '没记下来。';
            try {
              const text = ask;
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
              if (!spoken) return '[action:speak_empty]';
              if (current.kind === 'group' && config.mansui?.privateOnly !== false) return '这里不发语音。';
              if (current.dryRun) { logger.info('voice.would_send', { key, chars: spoken.length }); return '语音会发出去。'; }
              let file;
              if (mansui) {
                try { file = await mansui.speak(spoken); }
                catch (error) { logger.warn('voice.mansui_failed', { key, error: String(error?.message ?? error) }); return '[action:speak_failed]'; }
              }
              else {
                file = await tts.synthesize(spoken);
                if (file && rvc) file = await (rvcLimiter ? rvcLimiter.run(() => rvc.convert(file)) : rvc.convert(file));
              }
              if (!file) return '[action:speak_failed]';
              await gateway.sendMessage(current.kind, current.id, [{ type: 'record', data: { file } }]);
              logger.info('voice.sent', { key, chars: spoken.length });
              return '语音发出去了。';
            }
            if (name === 'draw_picture') return runDraw(args);
            if (name === 'sing_song') return runSing(args);

  };
}
