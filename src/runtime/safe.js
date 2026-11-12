export function ignoreError(fn, onError = null) {
  try { return fn(); } catch (error) { onError?.(error); return undefined; }
}

export function safeSync(fn, fallback = null, onError = null) {
  try { return fn(); } catch (error) { onError?.(error); return fallback; }
}

export async function safeAsync(fn, fallback = null, onError = null) {
  try { return await fn(); } catch (error) { onError?.(error); return fallback; }
}