export function buildSocialTools({ knowledge, tts, mansui, permissions, current, config, logger, key }) {
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
    };    const speakTool = (tts || mansui) ? {
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
          required: ['what', 'why', 'ask']
        }
      }
    } : null;
    const askOwnerTool = current.kind === 'group' && String(config.allow?.private?.[0] || '') ? {
      type: 'function',
      function: {
        name: 'ask_owner',
        description: '在群里遇到需要问主人的事时用。先自己判断语境：该私下问就私下问，能在群里问就在群里问，不要机械地分大小。不是用来申请权限的，申请权限用 request_permission。',
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

  return { knowledgeTool, speakTool, permissionTool, askOwnerTool, confideTool, runKnowledge };
}
