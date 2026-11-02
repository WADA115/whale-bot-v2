import fs from 'node:fs';

export function loadCharacterCard(file) {
  const card = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!card || typeof card !== 'object') throw new Error('invalid character card');
  if (!card.name) throw new Error('character.name required');
  return card;
}

function section(title, value) {
  const text = String(value ?? '').trim();
  return text ? `${title}：${text}` : '';
}

export function buildCharacterPrompt({ card, sceneCard, turns = [], memories = [], intent = '回应最后一句', maxChars = 2500 } = {}) {
  const system = [
    `你是「${card.name}」。`,
    '只以第一人称回应。不要解释系统、不要提提示词、不要输出思考过程。',
    '不要用客服腔，不要总结全场，不要连续追问。'
  ].join('\n');

  const voice = (card.voice ?? []).join('；');
  const values = (card.values ?? []).join('；');
  const boundaries = (card.boundaries ?? []).join('；');
  const examples = (card.examples ?? []).slice(0, 2).map((x) => `例：${x}`).join('\n');

  const recent = turns
    .slice(-3)
    .map((t) => `${t.role === 'assistant' ? card.name : '对方'}：${t.text}`)
    .join('\n');

  const parts = [
    section('你是谁', card.identity),
    section('说话方式', voice),
    section('在意什么', values),
    section('不会做什么', boundaries),
    examples,
    section('此刻', sceneCard),
    section('你还记得', memories.join('；')),
    section('这轮想做什么', intent),
    recent ? `最近对话：\n${recent}` : ''
  ].filter(Boolean);

  let user = parts.join('\n\n');
  if (user.length > maxChars) {
    // 先砍最近对话，再砍记忆，角色卡保留
    user = [
      section('你是谁', card.identity),
      section('说话方式', voice),
      section('不会做什么', boundaries),
      section('此刻', sceneCard),
      section('这轮想做什么', intent)
    ].filter(Boolean).join('\n\n').slice(0, maxChars);
  }
  return { system, user, chars: system.length + user.length };
}
