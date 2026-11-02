import fs from 'node:fs';
import path from 'node:path';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

export function createLogger({ dir, level = 'info', maxBytes = 8 * 1024 * 1024 } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'v2.jsonl');
  const threshold = LEVELS[level] ?? LEVELS.info;

  function rotate() {
    try {
      if (!fs.existsSync(file)) return;
      if (fs.statSync(file).size < maxBytes) return;
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      fs.renameSync(file, path.join(dir, `v2-${stamp}.jsonl`));
    } catch {}
  }

  function write(levelName, event, fields = {}) {
    if ((LEVELS[levelName] ?? LEVELS.info) < threshold) return;
    const record = { ts: new Date().toISOString(), level: levelName, event, ...fields };
    const line = JSON.stringify(record);
    if (levelName === 'error') console.error(line);
    else if (levelName === 'warn') console.warn(line);
    else console.log(line);
    try {
      rotate();
      fs.appendFileSync(file, line + '\n', 'utf8');
    } catch {}
    return record;
  }

  return {
    debug: (event, fields) => write('debug', event, fields),
    info: (event, fields) => write('info', event, fields),
    warn: (event, fields) => write('warn', event, fields),
    error: (event, fields) => write('error', event, fields),
    file
  };
}
