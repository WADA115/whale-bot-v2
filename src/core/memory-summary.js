import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function createMemorySummary({ file = 'state/memory-summary.md', metaFile = 'state/memory-summary.meta.json', textRouter, diary, milestones, contacts, logger = null } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  function read() { try { return fs.readFileSync(file, 'utf8').trim(); } catch { return ''; } }
  function materials() {
    return {
      diary: (diary?.recent?.(10) ?? []).map((x) => x.text),
      milestones: (milestones?.recent?.(10) ?? []).map((x) => x.what),
      people: (contacts?.list?.() ?? []).slice(0, 12).map((x) => ({ name: x.name, notes: (x.notes || []).map((n) => n.text).slice(-2) }))
    };
  }
  async function refresh({ force = false } = {}) {
    if (!textRouter) return null;
    const data = materials();
    if (!data.diary.length && !data.milestones.length && !data.people.length) return null;
    const hash = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
    let meta = {};
    try { meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')); } catch { meta = {}; }
    if (!force && meta.hash === hash) return read();
    const current = read();
    const system = [
      '你不是角色，是替她整理旧记忆的人。',
      '把她记得的事合成一段她自己的旧事：留下真正重要的，合并重复的，放下不重要的。',
      '只写她记得什么、怎么想；不要写报告、分数、等级、天数、概率、函数、固定台词。',
      '不要编没发生的事；不确定的就留白。只输出一小段，不要标题。'
    ].join('\n');
    const user = [current ? `之前留下的：\n${current}` : '', `最近的日记：\n${data.diary.join('\n') || '无'}`, `关系节点：\n${data.milestones.join('\n') || '无'}`, `记得的人：\n${JSON.stringify(data.people)}`].filter(Boolean).join('\n\n');
    try {
      const result = await textRouter.generate({ system, user, maxTokens: 1200, temperature: 0.4 });
      const text = String(result?.text || '').trim();
      if (!text) return null;
      fs.writeFileSync(file, text + '\n', 'utf8');
      fs.writeFileSync(metaFile, JSON.stringify({ hash, at: Date.now() }, null, 2) + '\n', 'utf8');
      logger?.info('memory.summary_updated', { chars: text.length });
      return text;
    } catch (error) {
      logger?.warn('memory.summary_failed', { error: String(error?.message ?? error) });
      return null;
    }
  }
  return { read, refresh };
}
