import fs from 'node:fs';
import path from 'node:path';

function alive(pid) {
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}

export function acquireRuntimeLock({ file, logger = null } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = fs.openSync(file, 'wx');
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() }));
      fs.closeSync(fd);
      return {
        ok: true,
        release: () => {
          try { fs.rmSync(file, { force: true }); } catch {}
        }
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      let existing = null;
      try { existing = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
      if (existing?.pid && alive(existing.pid) && Number(existing.pid) !== process.pid) {
        logger?.warn('runtime.already_running', { pid: existing.pid });
        return { ok: false, pid: existing.pid, release: () => {} };
      }
      try { fs.rmSync(file, { force: true }); } catch {}
    }
  }
  logger?.warn('runtime.lock_failed', {});
  return { ok: false, release: () => {} };
}
