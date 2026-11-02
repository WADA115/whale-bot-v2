import fs from 'node:fs';

const RULES = [
  { re: /(笑死|哈哈哈|草)/, desc: '笑死' },
  { re: /(在吗|在不)/, desc: '在吗' },
  { re: /(难绷|绷不住)/, desc: '难绷' },
  { re: /(晚安|睡了|困了)/, desc: '睡觉猫' },
  { re: /(委屈|难过|想哭)/, desc: '委屈猫' },
  { re: /(猫猫|猫咪)/, desc: '猫猫' }
];

export function loadStickers(file) {
  try {
    const list = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(list) ? list.filter((x) => x?.url) : [];
  } catch {
    return [];
  }
}

export function chooseSticker(text, stickers) {
  const value = String(text ?? '');
  for (const rule of RULES) {
    if (!rule.re.test(value)) continue;
    const hit = stickers.find((x) => String(x.desc ?? '').includes(rule.desc));
    if (hit) return hit;
  }
  return null;
}
