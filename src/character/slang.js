import fs from 'node:fs';

export function loadSlang(file) {
  try {
    const list = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(list) ? list.filter((x) => x?.term) : [];
  } catch {
    return [];
  }
}

export function matchSlang(text, entries) {
  const value = String(text ?? '');
  return entries
    .filter((x) => value.includes(String(x.term)))
    .slice(0, 3)
    .map((x) => `${x.term}：${x.meaning || '群里常用说法'}`);
}
