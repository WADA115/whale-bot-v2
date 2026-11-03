export function durationWord(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value < 2 * 60 * 1000) return '刚才断了一下';
  if (value < 45 * 60 * 1000) return '不到一个钟头';
  if (value < 2 * 60 * 60 * 1000) return '一两个钟头';
  if (value < 6 * 60 * 60 * 1000) return '小半天';
  if (value < 12 * 60 * 60 * 1000) return '大半天';
  if (value < 20 * 60 * 60 * 1000) return '差不多一天';
  if (value < 36 * 60 * 60 * 1000) return '一天多';
  if (value < 3 * 24 * 60 * 60 * 1000) return '两三天';
  if (value < 5 * 24 * 60 * 60 * 1000) return '三四天';
  if (value < 7 * 24 * 60 * 60 * 1000) return '快一个星期';
  if (value < 15 * 24 * 60 * 60 * 1000) return '一个多星期';
  if (value < 30 * 24 * 60 * 60 * 1000) return '半个多月';
  if (value < 60 * 24 * 60 * 60 * 1000) return '一个多月';
  if (value < 180 * 24 * 60 * 60 * 1000) return '几个月';
  if (value < 365 * 24 * 60 * 60 * 1000) return '大半年';
  return '一年多';
}
