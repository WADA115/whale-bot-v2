import fs from 'node:fs';

const RULES = [
  { re: /(笑死|哈哈哈|草)/, desc: ['笑死', '哈哈哈'] },
  { re: /(在吗|在不)/, desc: ['在吗'] },
  { re: /(难绷|绷不住)/, desc: ['难绷', '绷不住'] },
  { re: /(晚安|睡了|困了)/, desc: ['睡觉猫', '晚安', '困了'] },
  { re: /(委屈|难过|想哭)/, desc: ['委屈猫', '委屈'] },
  { re: /(猫猫|猫咪)/, desc: ['猫猫'] },
  { re: /(不服|生气|红温)/, desc: ['不服气', '生气', '红温了'] },
  { re: /(无语|离谱)/, desc: ['无语', '离谱'] },
  { re: /(喜欢|爱你|贴贴|抱抱)/, desc: ['喜欢', '爱你', '贴贴', '抱抱'] },
  { re: /(震惊|真的假的|好家伙)/, desc: ['震惊', '真的假的', '好家伙'] },
  { re: /(谢谢|多谢)/, desc: ['谢谢'] },
  { re: /(对不起|抱歉)/, desc: ['对不起'] },
  { re: /(摸鱼|偷懒)/, desc: ['摸鱼中'] },
  { re: /(好累|累了|心累)/, desc: ['好累', '心累'] },
  { re: /(饿了|干饭)/, desc: ['饿了', '干饭人'] },
  { re: /(早安|早上好)/, desc: ['早安'] }
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
    const hits = stickers.filter((x) => rule.desc.some((desc) => String(x.desc ?? '').includes(desc)));
    if (hits.length) return hits[Math.floor(Math.random() * hits.length)];
  }
  return null;
}
