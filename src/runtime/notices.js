const INSTINCT_WORDS = ['阿姨', '大妈', '老女人', '丑', '胖', '废物', '滚'];

function instinctNotice(text) {
  const hit = INSTINCT_WORDS.find((word) => String(text ?? '').includes(word));
  if (!hit) return '';
  return `[本能：被“${hit}”刺到，可能想顶回去，也可能装作没听见]`;
}

function safetyNotice(text) {
  const value = String(text ?? '');
  if (/(人肉|开盒|身份证|家庭住址|住址|地址|手机号|定位你|查你(家|地址)|现实身份)/.test(value)) {
    return '[安全：对方在问现实身份或隐私]';
  }
  if (/(帮我(杀|炸|黑)|制作炸弹|盗号|破解别人|偷拍)/.test(value)) {
    return '[安全：对方在要求危险或侵害他人的事]';
  }
  return '';
}

export function buildNotices({ message = null, text = '', person = null } = {}) {
  const content = String(text || message?.text || '');
  const notices = [];
  const safety = safetyNotice(content);
  if (safety) notices.push(safety);
  const instinct = instinctNotice(content);
  if (instinct) notices.push(instinct);
  if (/(我说过|我真的|确实|没骗你|是真的|我答应)/.test(content)) {
    notices.push('[事实确认：对方确认了之前说过或答应过的事]');
  }
  return notices;
}
