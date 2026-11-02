const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createActorRegistry({
  coalesceMs = 1200,
  maxQueue = 20,
  onTurn,
  onError = () => {},
  logger = null
} = {}) {
  if (typeof onTurn !== 'function') throw new Error('onTurn required');
  const states = new Map();

  function stateFor(key) {
    let state = states.get(key);
    if (!state) {
      state = { active: false, queue: [], turns: 0 };
      states.set(key, state);
    }
    return state;
  }

  async function run(key) {
    const state = stateFor(key);
    if (state.active) return;
    state.active = true;
    try {
      while (state.queue.length) {
        await sleep(Math.max(0, coalesceMs));
        const batch = state.queue.splice(0, state.queue.length);
        if (!batch.length) break;
        state.turns += 1;
        try {
          await onTurn(key, batch);
        } catch (error) {
          logger?.error('actor.turn_failed', {
            key,
            error: String(error?.message ?? error),
            batch: batch.length
          });
          onError(error, key, batch);
        }
      }
    } finally {
      state.active = false;
    }
  }

  function enqueue(key, message) {
    if (!key || !message) return false;
    const state = stateFor(key);
    state.queue.push(message);
    while (state.queue.length > maxQueue) state.queue.shift();
    if (!state.active) void run(key);
    return true;
  }

  function pending(key) {
    const state = states.get(key);
    return state ? { active: state.active, queued: state.queue.length, turns: state.turns } : { active: false, queued: 0, turns: 0 };
  }

  function snapshot() {
    return Object.fromEntries([...states.entries()].map(([key, state]) => [key, {
      active: state.active, queued: state.queue.length, turns: state.turns
    }]));
  }

  return { enqueue, pending, snapshot };
}
