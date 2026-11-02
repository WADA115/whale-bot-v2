const MARKERS = ['此刻', '心里', '猜', '打算', '关系', '事件', '旧事', '章节'];

function section(text, name) {
  const re = new RegExp(`【${name}】([\\s\\S]*?)(?=\\n【[^】]+】|$)`);
  return String(text ?? '').match(re)?.[1]?.trim() || '';
}

function field(block, name) {
  const re = new RegExp(`${name}：([\\s\\S]*?)(?=\\n(?:标题|全文|还记得)：|$)`);
  return String(block ?? '').match(re)?.[1]?.trim() || '';
}

export function parseEditorOutput(raw) {
  const text = String(raw ?? '').trim();
  if (!text || /^SKIP$/i.test(text)) return null;
  const nowParts = [];
  if (section(text, '此刻')) nowParts.push(`# 此刻\n\n${section(text, '此刻')}`);
  if (section(text, '心里')) nowParts.push(`# 心里\n\n${section(text, '心里')}`);
  if (section(text, '猜')) nowParts.push(`# 猜\n\n${section(text, '猜')}`);
  if (section(text, '打算')) nowParts.push(`# 打算\n\n${section(text, '打算')}`);
  const eventBlock = section(text, '事件');
  const oldBlock = section(text, '旧事');
  return {
    now: nowParts.join('\n\n'),
    relationship: section(text, '关系'),
    chapter: section(text, '章节')
      ? { title: field(section(text, '章节'), '标题'), text: field(section(text, '章节'), '内容') }
      : null,
    person: {
      head: section(text, '人物·头部'),
      middle: section(text, '人物·中部'),
      tail: section(text, '人物·尾部')
    },
    event: eventBlock
      ? {
        title: field(eventBlock, '标题'),
        full: field(eventBlock, '全文'),
        trace: field(eventBlock, '还记得')
      }
      : null,
    old: oldBlock
      ? { title: field(oldBlock, '标题'), trace: field(oldBlock, '还记得') }
      : null
  };
}

export function createStoryEditor({ store, textRouter, logger = null }) {
  async function update({ key, card = null, story, personId = '', notices = [], turns = [], userText = '', reply = '' } = {}) {
    if (!store || !textRouter || !story) return null;
    const person = personId ? store.readPerson?.(key, personId, card) : null;
    const current = [
      story.relationship ? `【已有的我们】\n${story.relationship}` : '',
      story.now ? `【此刻】\n${story.now}` : '',
      (notices || []).length ? `【通报】\n${notices.join('\n')}` : '',
      person?.head ? `【我眼里的他·头部】\n${person.head}` : '',
      person?.middle ? `【我眼里的他·中部】\n${person.middle}` : '',
      person?.tail ? `【我眼里的他·尾部】\n${person.tail}` : '',
      ...(story.chapters || []).map((x) => `【旧章节】\n${x.text}`),
      ...(story.episodes || []).map((x) => `【还记得】\n${x.text}`)
    ].filter(Boolean).join('\n\n');
    const turnsText = (turns || []).slice(-3).map((t) => `${t.role === 'assistant' ? '我' : '对方'}：${t.text}`).join('\n');
    const system = [
      '你是叙事编辑，不是角色。',
      '你整理故事，也整理她眼里的这个人；不写分数、等级、概率、衰减、天数、函数。',
      '只写她记得什么、此刻怎么想、她怎么看这个人。不要写报告，不要写完整推理，不要提取关键词。',
      '没有真正变化就输出 SKIP。',
      '',
      '输出格式：',
      '【此刻】',
      '（一段或几段，可以多句，像人话）',
      '【心里】可选',
      '（真有事才写，几句话，允许犹豫和矛盾）',
      '【猜】可选',
      '（可以多个可能，不合成概率）',
      '【打算】可选',
      '（可以想靠近又想收）',
      '【关系】可选',
      '（只有关系真的变化才写；只写相处方式：现在的距离 / 已经不用客气的部分 / 还没跨过的线 / 我对他的一点判断；不写好感、信任、数值）',
      '【事件】可选',
      '标题：...',
      '全文：...',
      '还记得：...',
      '【旧事】可选',
      '标题：...',
      '还记得：...',
      '【章节】可选',
      '标题：...',
      '内容：...',
      '【人物·头部】可选',
      '（只有长期模式或确认过的事才写；不要一句话定义一个人）',
      '【人物·中部】可选',
      '（他做过的、让你改观的事；可以矛盾和没看懂）',
      '【人物·尾部】可选',
      '（他今天的状态，你现在的感觉和猜测）'
    ].join('\n');
    const user = [
      current,
      `【刚才】\n${turnsText || '（还没有）'}`,
      `【对方说】\n${userText}`,
      `【我回】\n${reply}`,
      '只更新现在和真正变化的部分。',
      '如果通报是事实确认，才可以把尾部里被确认的猜测写进中部或头部；否则头部不动。'
    ].filter(Boolean).join('\n\n');
    const result = await textRouter.generate({ system, user });
    const parsed = parseEditorOutput(result.text);
    if (!parsed) return null;
    try {
      if (typeof store.apply === 'function') {
        store.apply(key, parsed, card, Number.isFinite(story.version) ? story.version : null);
      } else {
        if (parsed.now) store.writeSection(key, 'now', parsed.now, card);
        if (parsed.relationship) store.writeSection(key, 'relationship', parsed.relationship, card);
        if (parsed.event?.title) {
          store.addEpisode(key, parsed.event.title, parsed.event.full || parsed.event.trace || '', parsed.event.trace || parsed.event.full || '', card);
        }
        if (parsed.old?.title && parsed.old.trace) {
          const found = store.findEpisode(key, parsed.old.title);
          if (found) store.writeTrace(key, found.id, parsed.old.trace, card);
        }
        if (parsed.chapter?.title) {
          store.addChapter(key, parsed.chapter.title, parsed.chapter.text, card);
        }
      }
      if (personId && parsed.person && (parsed.person.head || parsed.person.middle || parsed.person.tail)) {
        store.writePerson?.(key, personId, parsed.person, card);
      }
    } catch (error) {
      if (error?.code === 'STORY_CONFLICT') {
        logger?.warn('story.editor_conflict', { key });
        return null;
      }
      throw error;
    }
    logger?.info('story.editor_updated', {
      key,
      now: Boolean(parsed.now),
      relationship: Boolean(parsed.relationship),
      event: Boolean(parsed.event?.title),
      old: Boolean(parsed.old?.title),
      chapter: Boolean(parsed.chapter?.title),
      person: Boolean(parsed.person?.head || parsed.person?.middle || parsed.person?.tail)
    });
    return parsed;
  }

  return { update };
}
