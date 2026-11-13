import { ok, fail } from './actor-result.js';
export function buildBiliTools({ bilibili, canWriteBili }) {
    return bilibili ? [
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
        ...(canWriteBili ? [{ type: 'function', function: { name: 'bili_reply_comment', description: '回复 B站视频下面的一条评论。只有在私聊、且主人已明确授权时才用。', parameters: { type: 'object', properties: { bvid: { type: 'string', description: 'BV 号' }, rpid: { type: 'string', description: '要回复的评论 rpid' }, message: { type: 'string', description: '回复内容' } }, required: ['bvid', 'rpid', 'message'] } } }] : []),
      ] : [])
    ] : [];

}

export async function runBiliAction({ name, args = {}, bilibili, mind, logger, key, writeGate }) {
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
          if (!writeGate.consume('bili_reply_comment')) { logger.warn('bili.write_denied', { key }); return fail('denied'); }
          const result = await bilibili.replyComment({ bvid: args.bvid, rpid: args.rpid }, args.message);
          logger.info('bili.comment_replied', { bvid: result.bvid, rpid: result.rpid, chars: String(args.message || '').length });
          return ok('sent');
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
        return fail('read_failed');
      }
      return fail('unknown_action');
    }

