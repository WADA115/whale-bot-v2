export function ok(action, extra = {}) {
  return { ok: true, action, ...extra };
}

export function fail(action, extra = {}) {
  return { ok: false, action, ...extra };
}
