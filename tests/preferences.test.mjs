import test from 'node:test';
import assert from 'node:assert/strict';
import { setupTheme } from '../dist/preferences.js';

const KEY = 'trespasser.theme.v1';
function fixture({ saved = null, dark = false, legacy = false, storageFailure = false, noMedia = false } = {}) {
  const values = new Map(saved === null ? [] : [[KEY, saved]]), writes = [], events = [], listeners = new Map();
  const storage = {
    getItem(key) { if (storageFailure) throw new Error('Storage denied');return values.get(key) ?? null; },
    setItem(key, value) { if (storageFailure) throw new Error('Storage denied');writes.push([key, value]);values.set(key, value); },
  };
  let osListener;
  const media = { matches: dark };
  if (legacy) media.addListener = handler => { osListener = handler; };
  else media.addEventListener = (type, handler) => { assert.equal(type, 'change');osListener = handler; };
  const document = { documentElement: { dataset: {}, style: {} } };
  const window = {
    localStorage: storage,
    CustomEvent: class { constructor(type, options) { this.type = type;this.detail = options.detail; } },
    dispatchEvent(event) { events.push(event); },
    addEventListener(type, handler) { listeners.set(type, handler); },
  };
  if (!noMedia) window.matchMedia = query => { assert.equal(query, '(prefers-color-scheme: dark)');return media; };
  const theme = setupTheme({ document, window, localStorage: storage });
  return { theme, document, window, storage, values, writes, events,
    os(value) { media.matches = value;osListener?.({ matches: value }); },
    storageEvent(value, key = KEY, storageArea = storage) { listeners.get('storage')({ key, newValue: value, storageArea }); },
  };
}

test('default system follows the OS and announces the resolved appearance', () => {
  const f = fixture({ dark: true });
  assert.equal(f.theme.getPreference(), 'system');
  assert.equal(f.theme.getTheme(), 'dark');
  assert.deepEqual(f.document.documentElement.dataset, { theme: 'dark', themePreference: 'system' });
  assert.equal(f.document.documentElement.style.colorScheme, 'dark');
  assert.equal(f.events[0].type, 'trespasser:theme');
  assert.deepEqual(f.events[0].detail, { preference: 'system', theme: 'dark' });
  f.os(false);
  assert.equal(f.theme.getTheme(), 'light');
  assert.deepEqual(f.events.at(-1).detail, { preference: 'system', theme: 'light' });
});

test('a saved explicit theme overrides the OS and switching back uses its latest value', () => {
  const f = fixture({ saved: 'light', dark: true });
  assert.equal(f.theme.getTheme(), 'light');
  const initialEvents = f.events.length;
  f.os(false);f.os(true);
  assert.equal(f.theme.getTheme(), 'light');
  assert.equal(f.events.length, initialEvents);
  assert.equal(f.theme.setPreference('system'), true);
  assert.equal(f.theme.getTheme(), 'dark');
  assert.deepEqual(f.writes, [[KEY, 'system']]);
});

test('choices persist independently of character data and a new page restores them', () => {
  const f = fixture();
  const characterArchive = '{"characters":[{"id":"hero","hp":7}]}';
  f.values.set('trespasser.record.v1', characterArchive);
  assert.equal(f.theme.setPreference('dark'), true);
  assert.equal(f.values.get('trespasser.record.v1'), characterArchive);
  assert.deepEqual(f.writes, [[KEY, 'dark']]);
  const reopened = setupTheme({ document: { documentElement: { dataset: {}, style: {} } }, window: f.window, localStorage: f.storage });
  assert.equal(reopened.getPreference(), 'dark');
  assert.equal(reopened.getTheme(), 'dark');
});

test('cross-tab changes apply without being written back and other storage is ignored', () => {
  const f = fixture({ dark: true });
  f.storageEvent('light');
  assert.equal(f.theme.getPreference(), 'light');
  assert.equal(f.theme.getTheme(), 'light');
  assert.deepEqual(f.writes, []);
  f.storageEvent('dark', 'unrelated.preference');
  f.storageEvent('dark', KEY, {});
  assert.equal(f.theme.getPreference(), 'light');
  f.storageEvent(null);
  assert.equal(f.theme.getPreference(), 'system');
  assert.equal(f.theme.getTheme(), 'dark');
  f.storageEvent('light');
  f.storageEvent(null, null);
  assert.equal(f.theme.getPreference(), 'system');
});

test('bad values fall back safely on load and cannot become an active choice', () => {
  const f = fixture({ saved: '<script>invalid</script>', dark: true });
  assert.equal(f.theme.getPreference(), 'system');
  const initialEvents = f.events.length;
  for (const value of [null, undefined, false, 1, {}, 'DARK', 'sepia', '<img>']) assert.equal(f.theme.setPreference(value), false);
  assert.equal(f.theme.getTheme(), 'dark');
  assert.equal(f.events.length, initialEvents);
  assert.deepEqual(f.writes, []);
  f.storageEvent('invalid');
  assert.equal(f.theme.getPreference(), 'system');
});

test('denied storage does not prevent choosing a usable page theme', () => {
  const f = fixture({ storageFailure: true });
  assert.equal(f.theme.getPreference(), 'system');
  assert.equal(f.theme.setPreference('dark'), true);
  assert.equal(f.document.documentElement.dataset.theme, 'dark');
  assert.equal(f.theme.getPreference(), 'dark');
  assert.deepEqual(f.writes, []);
  const deniedWindow = { get localStorage() { throw new Error('SecurityError'); } };
  const theme = setupTheme({ window: deniedWindow, document: {} });
  assert.equal(theme.setPreference('light'), true);
  assert.equal(theme.getTheme(), 'light');
});

test('OS changes also work with the legacy media listener API', () => {
  const f = fixture({ legacy: true });
  f.os(true);
  assert.equal(f.theme.getTheme(), 'dark');
  f.theme.setPreference('light');f.os(false);f.os(true);
  assert.equal(f.theme.getTheme(), 'light');
});

test('missing media support defaults system to light while explicit dark still works', () => {
  const f = fixture({ noMedia: true });
  assert.equal(f.theme.getPreference(), 'system');
  assert.equal(f.theme.getTheme(), 'light');
  f.theme.setPreference('dark');
  assert.equal(f.theme.getTheme(), 'dark');
  const fallback = setupTheme({ window: { matchMedia() { throw new Error('Unsupported'); } }, document: {} });
  assert.equal(fallback.getTheme(), 'light');
});

test('reselecting the same preference does not duplicate change notifications', () => {
  const f = fixture({ saved: 'dark' });
  const events = f.events.length;
  assert.equal(f.theme.setPreference('dark'), true);
  assert.equal(f.events.length, events);
  f.theme.setPreference('system');
  assert.equal(f.events.length, events + 1);
});
