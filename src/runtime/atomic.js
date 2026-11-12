import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function atomicWriteFile(file, data, { encoding = 'utf8', mode = undefined } = {}) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  try {
    fs.writeFileSync(tmp, data, { encoding, mode });
    fs.renameSync(tmp, file);
  } catch (error) {
    try { fs.rmSync(tmp, { force: true }); } catch {}
    throw error;
  }
}

export function atomicWriteJson(file, value, { space = 2, mode = undefined } = {}) {
  atomicWriteFile(file, JSON.stringify(value, null, space) + '\n', { mode });
}

export function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}