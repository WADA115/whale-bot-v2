export function buildMemoryTools({ milestones, diary, moments, contacts, screen, current }) {
    const milestoneTool = milestones ? {
      type: 'function',
      function: {
        name: 'remember_milestone',
        description: '发生了一件你们之间真正重要的事时，记一笔。不是每件小事都记，也不要写成好感度。',
        parameters: {
          type: 'object',
          properties: {
            what: { type: 'string', description: '发生了什么，短一点' }
          },
          required: ['what']
        }
      }
    } : null;
    const diaryTool = diary ? {
      type: 'function',
      function: {
        name: 'write_diary',
        description: '有些事你以后会想起、想自己留一笔时，用这个写进日记。不是每轮都写，也不写流水账。',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string', description: '你自己想留下的那一小段话' }
          },
          required: ['text']
        }
      }
    } : null;
    const screenTool = screen?.isEnabled?.() && current.kind === 'private' ? {
      type: 'function',
      function: {
        name: 'look_screen',
        description: '主人允许你看屏幕时，可以看一眼当前屏幕。只在需要判断画面时用，不要频繁；不要看密码、网银、证件、私人聊天窗口。',
        parameters: { type: 'object', properties: {} }
      }
    } : null;
    const readDiaryTool = diary ? {
      type: 'function',
      function: {
        name: 'read_diary',
        description: '你想细看某一篇日记时用。可以按日期，也可以按你记得的词找。不要每轮都读，想回忆时再读。',
        parameters: {
          type: 'object',
          properties: {
            date: { type: 'string', description: '日期，例如 2026-11-10；不记得就不传' },
            query: { type: 'string', description: '你记得的一个词或一句话；不记得就不传' }
          }
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

  return { milestoneTool, diaryTool, readDiaryTool, momentTool, forgetTool, screenTool };
}
