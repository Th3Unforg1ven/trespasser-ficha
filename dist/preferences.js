const THEME_KEY = 'trespasser.theme.v1';
const PREFERENCES = new Set(['light', 'dark', 'system']);
const preferenceOrDefault = value => PREFERENCES.has(value) ? value : 'system';

/** Browser appearance only; character data and account sessions are independent. */
export function setupTheme(options = {}) {
  const doc = options.document ?? globalThis.document;
  const win = options.window ?? globalThis.window;
  let storage = null;
  try { storage = Object.hasOwn(options, 'localStorage') ? options.localStorage : win?.localStorage; } catch { /* Browser privacy settings can deny storage access. */ }

  let preference = 'system';
  try { preference = preferenceOrDefault(storage?.getItem(THEME_KEY)); } catch { /* Apply a usable theme even with unavailable storage. */ }

  let media = null;
  try { media = win?.matchMedia?.('(prefers-color-scheme: dark)') ?? null; } catch { /* Older/embedded browsers fall back to light. */ }
  let systemDark = Boolean(media?.matches);
  let theme = 'light';
  let lastEvent = '';

  function notify() {
    const state = `${preference}:${theme}`;
    if (state === lastEvent) return;
    lastEvent = state;
    const detail = { preference, theme };
    try {
      const Constructor = win?.CustomEvent ?? globalThis.CustomEvent;
      let event;
      if (typeof Constructor === 'function') event = new Constructor('trespasser:theme', { detail });
      else if (doc?.createEvent) {
        event = doc.createEvent('CustomEvent');
        event.initCustomEvent('trespasser:theme', false, false, detail);
      }
      if (event) win?.dispatchEvent?.(event);
    } catch { /* A missing event constructor must not break the character sheet. */ }
  }

  function apply() {
    theme = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
    const html = doc?.documentElement;
    if (html) {
      if (html.dataset) {
        html.dataset.theme = theme;
        html.dataset.themePreference = preference;
      }
      if (html.style) html.style.colorScheme = theme;
    }
    notify();
  }

  function onSystemChange(event) {
    systemDark = typeof event?.matches === 'boolean' ? event.matches : Boolean(media?.matches);
    if (preference === 'system') apply();
  }
  try {
    if (typeof media?.addEventListener === 'function') media.addEventListener('change', onSystemChange);
    else media?.addListener?.(onSystemChange);
  } catch { /* Static preference controls still work without live OS events. */ }

  win?.addEventListener?.('storage', event => {
    if (event.key !== THEME_KEY && event.key !== null) return;
    if (event.storageArea && storage && event.storageArea !== storage) return;
    preference = preferenceOrDefault(event.key === null ? null : event.newValue);
    apply();
  });

  apply();
  return Object.freeze({
    getPreference: () => preference,
    getTheme: () => theme,
    setPreference(value) {
      if (!PREFERENCES.has(value)) return false;
      preference = value;
      try { storage?.setItem(THEME_KEY, preference); } catch { /* Keep the choice for this page when persistence fails. */ }
      apply();
      return true;
    },
  });
}
