import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function alive(pid) {
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}

function readLock(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

const STALE_MS = 5 * 60 * 1000;

export function acquireRuntimeLock({ file, logger = null } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = fs.openSync(file, 'wx');
      const token = crypto.randomBytes(16).toString('hex');
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, at: Date.now(), token }));
      fs.closeSync(fd);
      return {
        ok: true,
        heartbeat: () => {
          try {
            const current = readLock(file);
            if (current?.token === token) fs.writeFileSync(file, JSON.stringify({ pid: process.pid, at: Date.now(), token }));
          } catch {}
        },
        release: () => {
          try {
            const current = readLock(file);
            if (!current || current.token === token) fs.rmSync(file, { force: true });
          } catch {}
        }
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const existing = readLock(file);
      const age = Date.now() - Number(existing?.at || 0);
      if (existing?.pid && alive(existing.pid) && Number(existing.pid) !== process.pid && age < STALE_MS) {
        logger?.warn('runtime.already_running', { pid: existing.pid });
        return { ok: false, pid: existing.pid, release: () => {} };
      }
      try { fs.rmSync(file, { force: true }); } catch {}
    }
  }
  logger?.warn('runtime.lock_failed', {});
  return { ok: false, release: () => {} };
}
