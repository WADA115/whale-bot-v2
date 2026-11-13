export function createLimiter({ limit = 1 } = {}) {
  const max = Math.max(1, Number(limit) || 1);
  let active = 0;
  const waiting = [];
  async function run(task) {
    if (active >= max) await new Promise((resolve) => waiting.push(resolve));
    active += 1;
    try { return await task(); }
    finally {
      active -= 1;
      const next = waiting.shift();
      if (next) next();
    }
  }
  return { run, get active() { return active; }, get waiting() { return waiting.length; } };
}
