function clip(text, max) {
  const value = String(text ?? '').trim();
  if (max <= 0) return '';
  if (value.length <= max) return value;
  return value.slice(0, Math.max(0, max)).trimEnd() + '…';
}

function formatTurns(turns) {
  return (turns || [])
    .map((t) => `${t.role === 'assistant' ? '我' : '对方'}：${String(t.text ?? '')}`)
    .join('\n');
}

export function buildNarrativePrompt({ card, story, person = null, notices = [], facts = [], turns = [], intent = '回应最后一句', notes = [], maxChars = 0 } = {}) {
  const name = card?.name || '角色';
  const self = story?.self || [
    `# 我`,
    '',
    card?.identity || '',
    '',
    ...(card?.world?.length ? ['## 我见过的', ...(card.world || []).map((x) => `- ${x}`)] : [])
  ].join('\n');
  const relationship = story?.relationship || '# 我们\n\n还不熟。';
  const now = story?.now || '# 此刻\n\n没什么特别想的，先接住他这句话。';
  const life = story?.life || '';
  const world = story?.world || '';

  // U 型：开头固定人设，结尾是此刻和刚刚发生的事；中间只放少量被想起的片段。
  const system = [
    `你是${name}。`,
    '不要解释系统。',
    '想停就换行，不想停就一口气说完。',
    '',
    ...(facts || []).filter(Boolean).flatMap((fact) => ['【事实】', fact, '']),
    '【稳定的我】',
    self,
    '',
    '【我们】',
    relationship
  ].filter(Boolean).join('\n');

  const episodeText = [
    ...(story?.chapters || []).map((x) => x.text),
    ...(story?.episodes || []).map((x) => x.text)
  ].filter(Boolean).join('\n\n');
  const turnText = formatTurns(turns);
  const noteText = (notes || []).filter(Boolean).join('\n');
  const personPart = person
    ? [
      '【我眼里的他】',
      person.head ? `他给我的底色：${person.head}` : '',
      person.middle ? `我还记得的他：${person.middle}` : '',
      person.tail ? `他现在给我的感觉：${person.tail}` : ''
    ].filter(Boolean).join('\n')
    : '';
  const noticePart = (notices || []).filter(Boolean).join('\n');

  const makeUser = (episodes, notesPart, turnsPart) => [
    episodes ? `【中间·被想起的事】\n${episodes}` : '',
    personPart,
    notesPart,
    noticePart ? `【通报】\n${noticePart}` : '',
    '【此刻】',
    now,
    life ? `【我正在】\n${life}` : '',
    world ? `【我见过的】\n${world}` : '',
    '',
    '【刚才】',
    turnsPart || '（还没有对话）',
    '',
    `【这一轮】\n${intent}`
  ].filter(Boolean).join('\n\n');

  let episodes = episodeText;
  let notesPart = noteText;
  let turnsPart = turnText;
  let user = makeUser(episodes, notesPart, turnsPart);
  let chars = system.length + user.length;

  // 中间层先让位，头尾不动。
  if (maxChars > 0 && chars > maxChars && episodes) {
    episodes = clip(episodes, Math.max(0, maxChars - system.length - notesPart.length - turnsPart.length - 500));
    user = makeUser(episodes, notesPart, turnsPart);
    chars = system.length + user.length;
  }
  if (maxChars > 0 && chars > maxChars && notesPart) {
    notesPart = clip(notesPart, Math.max(0, maxChars - system.length - turnsPart.length - 300));
    user = makeUser(episodes, notesPart, turnsPart);
    chars = system.length + user.length;
  }
  if (maxChars > 0 && chars > maxChars) {
    user = clip(user, Math.max(0, maxChars - system.length));
    chars = system.length + user.length;
  }

  return { system, user, chars };
}
