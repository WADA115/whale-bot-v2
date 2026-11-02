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

export function buildNotices({ message = null, text = '' } = {}) {
  const content = String(text || message?.text || '');
  const notices = [];
  const safety = safetyNotice(content);
  if (safety) notices.push(safety);
  if (/(不要|别|以后最好|能不能不|不许|停止|别再)/.test(content)) {
    notices.push(`[请求：对方明确说“${content.trim().slice(0, 80)}”]`);
  }
  if (/(我说过|我真的|确实|没骗你|是真的|我答应)/.test(content)) {
    notices.push('[事实确认：对方确认了之前说过或答应过的事]');
  }
  return notices;
}
