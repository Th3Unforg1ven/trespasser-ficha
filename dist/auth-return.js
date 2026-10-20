const KEY = 'trespasser.auth.destination.v1';
const MAX_AGE_MS = 15 * 60 * 1000;

// Keep only a fixed destination and timestamp. OAuth credentials stay with the SDK.
export function rememberHavenReturn(storage, now = Date.now()) {
  try {
    storage.setItem(KEY, JSON.stringify({ destination: 'havens', createdAt: now }));
    return true;
  } catch { return false; }
}

export function consumeHavenReturn(storage, { authReturn = false, now = Date.now() } = {}) {
  if (!authReturn) return false;
  try {
    const raw = storage.getItem(KEY);
    storage.removeItem(KEY);
    const intent = JSON.parse(raw);
    const age = now - intent?.createdAt;
    return intent?.destination === 'havens' && Number.isFinite(intent.createdAt)
      && age >= 0 && age <= MAX_AGE_MS;
  } catch { return false; }
}
