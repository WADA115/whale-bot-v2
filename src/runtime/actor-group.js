import { readGroupHistory } from './group-history.js';

export function buildGroupTools({ current, config, liveGroup, gateway }) {
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
      if (!blocks.length) return { ok: false, action: 'empty', groups: [...new Set(names)] };
      return { ok: true, groups: [...new Set(names)], text: blocks.join('\n\n') };
    };

  return { groupTool, lookAtGroups };
}
