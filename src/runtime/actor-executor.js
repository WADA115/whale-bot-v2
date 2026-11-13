import { runBiliAction } from './actor-bili.js';
import { ok, fail } from './actor-result.js';
export function createToolExecutor({ lookAtGroups, runKnowledge, config, gateway, moments, milestones, current, screen, visionRouter, logger, key, diaryEntries, diary, contacts, permissions, mansui, tts, rvc, rvcLimiter, runDraw, runSing, bilibili, mind, writeGate }) {
  return async function execute(name, args) {

            if (name === 'look_group_history') return lookAtGroups();
            if (name === 'search_local') return runKnowledge(args);
          if (name === 'confide') {
            const say = String(args?.text ?? '').trim();
            if (!say) return fail('empty_text');
            const owner = String(config.allow?.private?.[0] || '');
            if (!owner) return fail('no_owner');
            await gateway.sendMessage('private', owner, [{ type: 'text', data: { text: say } }]);
            moments?.add?.({ what: say, audience: '私下', key });
            return ok('sent_private');
          }
          if (name === 'remember_milestone') {
            const what = String(args?.what ?? '').trim();
            if (!what) return fail('empty');
            milestones?.add?.({ what, who: String(current.senderName || current.userId || ''), key });
            return ok('saved');
          }
          if (name === 'look_screen') {
            if (!screen?.isEnabled?.()) return fail('disabled');
            try {
              const file = screen.frame ? await screen.frame() : await screen.capture();
              const described = await visionRouter.describe({ message: { segments: [{ type: 'image', data: { file } }] } });
              return described?.text ? `屏幕：${described.text}` : '[screen:unreadable]';
            } catch (error) {
              logger.warn('screen.failed', { key, error: String(error?.message ?? error) });
              return fail('capture_failed');
            }
          }
          if (name === 'read_diary') {
            const date = String(args?.date ?? '').trim();
            const query = String(args?.query ?? '').trim().toLowerCase();
            let hits = diaryEntries.slice();
            if (date) hits = hits.filter((item) => String(item.date || new Date(Number(item.at) || Date.now()).toLocaleDateString('sv-SE')) === date);
            if (query) hits = hits.filter((item) => String(item.text || '').toLowerCase().includes(query));
            if (!hits.length) return fail('empty');
            return hits.slice(-6).map((item) => {
              const d = item.date || new Date(Number(item.at) || Date.now()).toLocaleDateString('sv-SE');
              return `${d}\n${item.text}`;
            }).join('\n\n');
          }
          if (name === 'write_diary') {
            const text = String(args?.text ?? '').trim();
            if (!text) return fail('empty');
            diary?.add?.({ text });
            return ok('saved');
          }
          if (name === 'note_moment') {
            const what = String(args?.what ?? '').trim();
            if (!what) return fail('empty');
            moments?.add?.({ what, audience: current.kind === 'group' ? '当众' : '私下', key });
            return ok('saved');
          }
          if (name === 'forget_memory') {
            const person = String(args?.person ?? '').trim();
            const text = String(args?.text ?? '').trim();
            const numeric = /^\d+$/.test(person);
            const removed = contacts?.forget?.({ id: numeric ? person : (person ? '' : String(current.userId || '')), name: numeric ? '' : person, text });
            return removed ? ok('forgotten') : fail('not_found');
          }
          if (name === 'ask_owner') {
            const ask = String(args?.text ?? '').trim();
            if (!ask) return fail('empty');
            const owner = String(config.allow?.private?.[0] || '');
            if (!owner) return fail('no_owner');
            await gateway.sendMessage('private', owner, [{ type: 'text', data: { text: ask } }]);
            return ok('sent_private');
          }
          if (name === 'request_permission') {
            const what = String(args?.what ?? '').trim();
            const why = String(args?.why ?? '').trim();
            const ask = String(args?.ask ?? '').trim();
            if (!what) return fail('empty');
            if (!ask) return fail('missing_ask');
            const owner = String(config.allow?.private?.[0] || '');
            if (!permissions || (current.kind !== 'group' && !owner)) return fail('no_owner');
            const ownerKey = owner ? `private:${owner}` : '';
            const keys = current.kind === 'group' ? [key, ownerKey].filter(Boolean) : [key];
            const req = permissions.request({ what, why, key, keys });
            if (!req) return fail('not_recorded');
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
            return ok('asked');
          }
            if (name === 'speak') {
              const spoken = String(args?.text ?? '').trim();
              if (!spoken) return fail('empty');
              if (current.kind === 'group' && config.mansui?.privateOnly !== false) return fail('group_voice_disabled');
              if (current.dryRun) { logger.info('voice.would_send', { key, chars: spoken.length }); return ok('would_send'); }
              let file;
              if (mansui) {
                try { file = await mansui.speak(spoken); }
                catch (error) { logger.warn('voice.mansui_failed', { key, error: String(error?.message ?? error) }); return fail('speak_failed'); }
              }
              else {
                file = await tts.synthesize(spoken);
                if (file && rvc) file = await (rvcLimiter ? rvcLimiter.run(() => rvc.convert(file)) : rvc.convert(file));
              }
              if (!file) return fail('speak_failed');
              await gateway.sendMessage(current.kind, current.id, [{ type: 'record', data: { file } }]);
              logger.info('voice.sent', { key, chars: spoken.length });
              return ok('sent_voice');
            }
            if (name === 'draw_picture') return runDraw(args);
            if (name === 'sing_song') return runSing(args);

  };
}
