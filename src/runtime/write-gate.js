export function createWriteGate({ permissions = null, key = '', kind = 'private', logger = null } = {}) {
  let used = false;

  function canUse() {
    if (kind !== 'private') return false;
    return Boolean(permissions?.active?.(key)?.length);
  }

  function consume(action = '') {
    if (used) {
      logger?.warn('write_gate.used', { action, key });
      return false;
    }
    if (!canUse()) {
      logger?.warn('write_gate.denied', { action, key });
      return false;
    }
    used = true;
    return true;
  }

  return { canUse, consume };
}
