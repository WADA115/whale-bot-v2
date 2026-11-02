function labelKey(name, labels = {}) {
  const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
  return `${name}{${entries.map(([k, v]) => `${k}="${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')}}`;
}

export function createMetrics() {
  const counters = new Map();
  const timers = new Map();
  const buckets = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30];

  function inc(name, labels = {}, value = 1) {
    const key = labelKey(name, labels);
    counters.set(key, (counters.get(key) || 0) + Number(value));
  }

  function observe(name, seconds, labels = {}) {
    const key = labelKey(name, labels);
    const item = timers.get(key) || { count: 0, sum: 0, buckets: buckets.map(() => 0) };
    const value = Number(seconds);
    item.count += 1;
    item.sum += value;
    for (let i = 0; i < buckets.length; i += 1) {
      if (value <= buckets[i]) item.buckets[i] += 1;
    }
    timers.set(key, item);
  }

  function snapshot() {
    return {
      counters: Object.fromEntries(counters),
      timers: Object.fromEntries(timers)
    };
  }

  function prometheus() {
    const lines = [];
    const seen = new Set();
    for (const [key, value] of counters) {
      const name = key.slice(0, key.indexOf('{'));
      if (!seen.has(name)) {
        lines.push(`# TYPE ${name} counter`);
        seen.add(name);
      }
      lines.push(`${key} ${value}`);
    }
    for (const [key, item] of timers) {
      const name = key.slice(0, key.indexOf('{'));
      if (!seen.has(name)) {
        lines.push(`# TYPE ${name} histogram`);
        seen.add(name);
      }
      const inner = key.slice(key.indexOf('{') + 1, -1);
      const withLe = (le) => `${name}_bucket` + (inner ? `{le="${le}",${inner}}` : `{le="${le}"}`);
      let cumulative = 0;
      for (let i = 0; i < buckets.length; i += 1) {
        cumulative = item.buckets[i];
        lines.push(`${withLe(buckets[i])} ${cumulative}`);
      }
      lines.push(`${withLe('+Inf')} ${item.count}`);
      lines.push(`${name}_sum ${item.sum}`);
      lines.push(`${name}_count ${item.count}`);
    }
    return `${lines.join('\n')}\n`;
  }

  return { inc, observe, snapshot, prometheus };
}
