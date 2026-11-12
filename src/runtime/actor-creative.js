export function buildCreativeTools({ draw, sing, gateway, current, stats, logger, key }) {
    const drawTool = draw ? {
      type: 'function',
      function: {
        name: 'draw_picture',
        description: '想画简笔画时使用。画完会直接把图发给他。坐标是像素，左上角原点，默认 640x480。画动物或人时画完整身体、四肢、尾巴，不要只画一个头；圆润一点，头略大，少而完整的线条，可以给形状加 fill 填浅色；不要画成几何拼图。图元 t：line/polyline/polygon/circle/ellipse/dot/rect/bezier/arc/text。',
        parameters: {
          type: 'object',
          properties: {
            bg: { type: 'string', description: '背景色，如 #ffffff' },
            width: { type: 'number' },
            height: { type: 'number' },
            shapes: {
              type: 'array',
              description: '图元数组',
              items: {
                type: 'object',
                properties: {
                  t: { type: 'string' },
                  p: { type: 'array', items: { type: 'number' } },
                  c: { type: 'array', items: { type: 'number' } },
                  r: { type: 'number' },
                  s: { type: 'string' },
                  size: { type: 'number' }
                },
                additionalProperties: true
              }
            }
          },
          required: ['shapes']
        }
      }
    } : null;
    const runDraw = async (args = {}) => {
      try {
        const spec = { ...args };
        if (Array.isArray(args?.shapes)) spec.shapes = args.shapes;
        const result = await draw.render(spec);
        await gateway.sendMessage(current.kind, current.id, [{ type: 'image', data: { file: result.file } }]);
        stats.imageCount += 1;
        logger.info('draw.sent', { key, file: result.file });
        return '画好了，图已经发出去。';
      } catch (error) {
        return '[action:draw_failed]';
      }
    };
    const singTool = sing ? {
      type: 'function',
      function: {
        name: 'sing_song',
        description: '想唱一小段时使用。给歌词，唱完会直接把语音发给他。',
        parameters: {
          type: 'object',
          properties: { lyrics: { type: 'string', description: '要唱的歌词，短一点' } },
          required: ['lyrics']
        }
      }
    } : null;
    const runSing = async (args = {}) => {
      try {
        const result = await sing.render({ lyrics: args.lyrics });
        await gateway.sendMessage(current.kind, current.id, [{ type: 'record', data: { file: result.file } }]);
        logger.info('sing.sent', { key, file: result.file });
        return '唱好了，语音已经发出去。';
      } catch (error) {
        return '[action:sing_failed]';
      }
    };

  return { drawTool, singTool, runDraw, runSing };
}
