import fs from 'node:fs';
import path from 'node:path';

export function createTaskInbox({ file, logger = null, max = 200 } = {}) {
  let data = { tasks: [] };
  try {
    if (file && fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Array.isArray(parsed?.tasks)) data = parsed;
    }
  } catch (error) {
    logger?.warn('tasks.load_failed', { error: String(error?.message ?? error) });
  }

  function save() {
    if (!file) return;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmp, file);
    } catch (error) {
      logger?.warn('tasks.save_failed', { error: String(error?.message ?? error) });
    }
  }

  function add({ key = '', text = '', kind = 'task', userId = '' } = {}) {
    const value = String(text ?? '').trim();
    if (!value) return null;
    const task = { id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, key, kind, userId, text: value.slice(0, 1000), at: Date.now(), status: 'pending' };
    data.tasks.push(task);
    while (data.tasks.length > max) data.tasks.shift();
    save();
    return task;
  }

  function list({ limit = 20, status = '' } = {}) {
    return data.tasks
      .filter((x) => !status || x.status === status)
      .slice(-Math.max(1, limit));
  }

  function count() {
    return data.tasks.length;
  }

  function update(id, patch = 'done') {
    const task = data.tasks.find((x) => x.id === id);
    if (!task) return null;
    if (typeof patch === 'string') task.status = patch;
    else Object.assign(task, patch, { updatedAt: Date.now() });
    save();
    return task;
  }

  function get(id) {
    return data.tasks.find((x) => x.id === id) ?? null;
  }

  function clear() {
    data.tasks = [];
    save();
  }

  return { add, list, count, get, update, clear };
}
