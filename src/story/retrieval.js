function termsOf(text) {
  const raw = String(text ?? '').split(/[\s，。！？、,.!?：:；;“”"'（）()]+/).map((x) => x.trim()).filter((x) => x.length >= 2);
  const terms = new Set(raw);
  for (const value of raw) {
    if (/[\u4e00-\u9fff]/.test(value)) {
      for (let i = 0; i + 2 <= value.length; i += 1) terms.add(value.slice(i, i + 2));
    }
  }
  return [...terms].slice(0, 80);
}

function scoreOf(item, terms) {
  const body = `${item.title || ''}\n${item.text || ''}`;
  let score = 0;
  for (const term of terms) {
    if (body.includes(term)) score += 1;
  }
  return score;
}

export function selectRelevantSlices(story = {}, query = '', limit = 2) {
  const terms = termsOf(query);
  const rank = (items = []) => {
    if (items.length <= 1 || !terms.length) return items.slice(-Math.max(1, limit));
    const scored = items.map((item, index) => ({ item, index, score: scoreOf(item, terms) }));
    const hits = scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score || b.index - a.index);
    if (hits.length) return hits.slice(0, limit).map((x) => x.item);
    return items.slice(-1);
  };
  return {
    ...story,
    episodes: rank(story.episodes || []),
    chapters: rank(story.chapters || [])
  };
}
