export function shouldReflect({ text = '', imageDesc = '', voiceDesc = '', notices = [] } = {}) {
  if (imageDesc || voiceDesc) return true;
  if ((notices || []).some((notice) => /事实确认|安全|请求/.test(notice))) return true;
  return /(记错|不是叫|我叫|名字|答应|承诺|对不起|道歉|以后|下次|别再|不要这样|不要带|不要叫|能不能不)/.test(String(text ?? ''));
}
