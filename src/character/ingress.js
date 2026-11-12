const TASK_PATTERNS = [
  /^(?:请)?帮我(?:写|做|查|找|改|翻译|总结|生成|整理|优化|计算|搜索)/,
  /^(?:请)?(?:写|做|查|找|改|翻译|总结|生成|整理|优化|计算)(?:一|个|下|一下|份|篇|段|这|那)/,
  /(?:帮我|麻烦|请|给我)(?:周报|日报|代码|方案|文档|表格|翻译|总结|搜索一下|查一下)/
];

export function routeIncoming(text) {
  const value = String(text ?? '').trim();
  if (!value) return { kind: 'social', text: value };
  if (TASK_PATTERNS.some((re) => re.test(value))) return { kind: 'task', text: value };
  return { kind: 'social', text: value };
}
