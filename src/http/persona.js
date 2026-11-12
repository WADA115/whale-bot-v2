export function personaFromText(raw, fallback = {}) {
  const value = String(raw ?? '');
  const match = value.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('模型没有返回角色卡 JSON');
  const parsed = JSON.parse(match[0]);
  const text = (item, max) => String(item ?? '').trim().slice(0, max);
  const list = (items, max) => (Array.isArray(items) ? items : String(items ?? '').split('\n'))
    .map((item) => String(item).trim()).filter(Boolean).slice(0, max);
  const card = {
    name: text(parsed.name, 40) || text(fallback.name, 40),
    identity: text(parsed.identity, 1200) || text(fallback.identity, 1200),
    drive: text(parsed.drive, 1200) || text(fallback.drive, 1200),
    voice: list(parsed.voice, 12).length ? list(parsed.voice, 12) : list(fallback.voice, 12),
    world: list(parsed.world, 12),
    boundaries: list(parsed.boundaries, 12),
    views: list(parsed.views, 12).length ? list(parsed.views, 12) : list(fallback.views, 12),
    taste: list(parsed.taste, 12).length ? list(parsed.taste, 12) : list(fallback.taste, 12),
    line: list(parsed.line, 12).length ? list(parsed.line, 12) : list(fallback.line, 12),
    selfImage: text(parsed.selfImage, 600) || text(fallback.selfImage, 600)
  };
  if (!card.name) throw new Error('角色卡缺少名字');
  if (!card.identity) throw new Error('角色卡缺少身份');
  return card;
}

export function personaPrompt(brief, current = null, instruction = '') {
  const system = [
    '你是 QQ 角色卡编辑助手。',
    '根据用户描述写一张角色卡，只输出 JSON，不要 Markdown，不要解释。',
    '字段：name 字符串，identity 字符串，drive 字符串，voice 字符串数组，world 字符串数组（具体见过的社会片段，不是价值标签），boundaries 字符串数组（只写运行底线：不泄密、不假冒现实操作；不写情感边界），views 字符串数组（她自己的立场），taste 字符串数组（喜欢/讨厌），line 字符串数组（会顶回去的事），selfImage 字符串。',
    '不要写年龄、天数、年限、次数、分数、等级、概率、函数、固定台词、示例对话。',
    '身份要像一个人，不要写客服、助手、工具人。'
  ].join('\n');
  const user = current
    ? `当前角色卡：\n${JSON.stringify(current, null, 2)}\n\n精修要求：\n${instruction}`
    : `角色描述：\n${brief}`;
  return { system, user };
}
export function personaChatPrompt({ history = [], message = '', current = null } = {}) {
  const transcript = (Array.isArray(history) ? history : []).slice(-20)
    .map((x) => `${x.role === 'assistant' ? '你' : '用户'}：${String(x.text || '').slice(0, 400)}`).join('\n');
  const system = [
    '你是角色卡编辑助手，正在和用户一问一答地打磨一个 QQ 角色。',
    '每次只问一个最关键的问题，用简短、直接的中文问，不要一次问多个，不要长篇。',
    '根据用户的回答逐步明确：身份、驱动力、说话方式、个人观、偏好、会顶回去的事、自我形象。',
    '不要写年龄、天数、年限、次数、分数、等级、概率、函数、固定台词、示例对话。',
    '当用户说“就这样 / 开始写 / 可以了 / 写卡”时，输出完整角色卡 JSON，字段：name, identity, drive, voice, world, boundaries, views, taste, line, selfImage。只输出 JSON。',
    '其他时候只输出一句下一个问题，不要 JSON，不要解释，不要总结。'
  ].join('\n');
  const user = [
    current ? `当前角色卡：\n${JSON.stringify(current, null, 2)}` : '',
    transcript ? `已经聊过：\n${transcript}` : '',
    `用户刚才说：${String(message || '').slice(0, 800)}`
  ].filter(Boolean).join('\n\n');
  return { system, user };
}
