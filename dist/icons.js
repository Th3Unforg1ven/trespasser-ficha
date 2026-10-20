// Original ink-cut symbols for the character record. Solid silhouettes, uneven
// edges and small negative cuts follow the book's printed fantasy illustrations.
const cuts = Object.freeze({
  record: 'M8 2 27 3 26 29 7 30 6 25 3 24 4 7 8 6ZM10 6 10 26 23 25 24 7ZM5 9 5 22 7 23 7 8ZM12 10H21V12H12ZM12 15H21V17H12ZM13 20 17 18 21 21 17 24Z',
  helm: 'M16 2 23 6 28 15 27 27 21 30 11 29 5 25 5 15 9 6ZM12 12 9 18 11 25 16 27 21 24 23 17 19 12ZM11 9 14 6 12 10ZM21 9 25 15 23 16ZM12 17 15 16 15 19 12 19ZM18 16 21 17 21 19 18 19ZM16 20 18 23 15 23Z',
  person: 'M15 2 22 5 24 13 21 18 28 22 30 30 2 29 5 22 11 18 8 13 9 6ZM13 9 12 13 16 17 20 13 19 9ZM9 23 6 27 13 27ZM21 23 18 27 26 28ZM15 20 13 24 16 28 19 24Z',
  torch: 'M17 1 23 7 21 11 26 9 25 18 20 22 10 21 6 16 8 9 11 11 12 4 15 8ZM17 9 13 15 15 18 20 17 21 14 18 15ZM11 22 21 23 20 26 10 25ZM12 26 19 27 18 31 13 31ZM14 27 15 30 16 30 15 27Z',
  gate: 'M3 10 7 7 7 4 12 4 16 1 21 5 26 4 27 9 30 11 28 14 27 30 4 29 4 14 1 13ZM11 16 10 27 22 27 21 16 18 12 14 12ZM8 9 8 12 11 10ZM23 10 25 13 25 9ZM6 18H8V22H6ZM24 21H26V25H24ZM14 16H16V26H14ZM18 15H20V26H18Z',
  castle: 'M2 5H6V9H9V5H13V14H19V8H22V3H26V8H29V30H3L2 19ZM6 14H9V18H6ZM23 12H26V17H23ZM13 24V28H20V24L17 21ZM6 23H8V27H6ZM23 23H26V27H23ZM14 16H17V18H14Z',
  cover: 'M9 3 28 5 26 28 7 30 3 26 5 7ZM11 7 10 25 23 24 25 9ZM6 9 5 24 7 26 8 8ZM16 10 21 16 16 22 12 17ZM16 13 14 17 16 19 18 16Z',
  dice: 'M16 1 29 8 30 23 16 31 2 23 3 8ZM16 5 8 9 13 11ZM19 5 19 11 26 9ZM6 12 5 21 11 15ZM26 12 21 15 27 21ZM15 14 10 23 23 23 18 14ZM6 24 13 28 10 24ZM25 24 20 24 18 28ZM13 12 17 12 15 9Z',
  import: 'M7 2 25 3 25 10 22 9 22 6 10 5 9 25 22 26 22 23 25 22 25 29 6 30 5 7ZM14 11 19 11 19 17 24 17 16 25 9 17 14 17ZM3 11 4 19 5 15ZM27 6 29 13 28 17Z',
  export: 'M7 2 25 3 25 10 22 9 22 6 10 5 9 25 22 26 22 23 25 22 25 29 6 30 5 7ZM16 8 24 16 19 16 19 23 14 23 14 16 9 16ZM3 12 4 21 5 16ZM27 12 29 16 28 23Z',
  print: 'M7 2 25 3 25 10 28 10 30 15 28 24 25 24 25 30 7 29 7 24 3 23 2 12 5 10 7 10ZM10 5V10H22V6ZM10 19V26L22 27V19ZM6 14 6 17 9 17 9 14ZM12 21H20V23H12ZM12 25H18V26H12Z',
  sword: 'M24 2 30 2 29 8 15 22 10 17ZM25 6 13 18 14 19 27 6ZM5 13 20 27 17 30 2 16ZM9 22 12 25 8 29 5 26ZM4 25 8 29 5 31 1 28Z',
  bag: 'M9 2 22 3 20 8 24 12 29 25 26 30 6 29 3 25 7 13 11 8ZM13 4 14 8 17 8 19 5ZM11 12 7 23 9 26 24 27 26 24 21 13ZM12 9 21 9 22 12 10 11ZM11 16 11 23 13 24 14 15ZM18 15 18 24 21 22 20 16Z',
  book: 'M2 5 11 3 16 6 21 3 30 5 29 27 20 27 16 30 11 27 3 28ZM6 8 6 23 12 23 14 25 14 10 11 7ZM18 10V25L21 23 26 24 27 8 21 7ZM8 11 12 11 12 13 8 14ZM8 17 12 17 12 19 8 20ZM20 12 25 10 25 13 20 15ZM20 18 24 17 24 20 20 21Z',
  shield: 'M16 2 29 7 27 20 22 26 16 31 8 26 4 20 3 7ZM16 6 8 10 9 19 16 26ZM20 9 18 12 24 11 24 9ZM19 15 18 18 23 16 24 13ZM18 21 17 24 21 21 22 18Z',
  arrow: 'M4 11 18 10 17 4 30 16 18 29 18 22 3 23 4 17 2 14ZM7 14 17 14 15 16 7 16ZM21 12 25 16 22 19 23 16Z',
  plus: 'M12 3 19 2 19 12 29 12 30 19 20 20 20 30 12 29 12 21 2 20 3 13 12 12ZM15 6 15 11 16 10 17 5ZM23 15 27 15 27 16 22 17Z',
  minus: 'M3 12 29 11 30 20 3 21 2 16ZM6 15 15 14 14 16 6 17ZM20 14 26 14 27 16 20 16Z',
  close: 'M5 2 16 12 25 2 30 6 20 16 30 26 26 30 16 21 6 30 2 25 12 16 2 6ZM6 6 14 14 12 14 5 8ZM24 24 26 25 26 27 21 22Z',
  edit: 'M22 2 30 9 11 28 2 30 4 21ZM21 7 8 21 11 24 25 10ZM6 23 5 27 9 26ZM24 4 22 6 27 11 29 9ZM18 12 12 18 13 19 20 13Z',
  trash: 'M4 6 12 5 13 2 21 2 22 5 29 6 28 10 3 10ZM7 12 26 11 24 30 8 29ZM11 15 12 26 14 26 13 14ZM18 14 17 26 20 26 21 14ZM15 4 15 6 19 6 19 4Z',
  duplicate: 'M4 3 23 2 24 7 29 8 28 29 9 30 8 26 3 26ZM7 7 7 22 9 22 10 8 20 7ZM13 12 12 26 24 25 25 12ZM15 15H22V17H15ZM15 20H22V22H15Z',
  rest: 'M5 28 28 21 30 25 6 31ZM4 22 28 28 26 31 2 25ZM16 2 23 9 20 13 26 11 25 20 19 24 12 23 6 18 8 11 11 14 12 6 15 10ZM16 11 13 18 17 21 21 18 18 15 17 18Z',
  moon: 'M25 4C19 3 17 8 17 13 17 20 22 24 29 22L25 28 17 31 9 28 4 22 2 14 6 6 13 2 20 1ZM9 10 6 15 8 20 9 17ZM12 24 17 27 19 26 13 23ZM25 6 27 8 30 7 29 11 31 14 27 14 25 17 24 13 21 11 25 10Z',
  sync: 'M3 13 6 5 15 1 23 4 26 7 30 4 30 15 18 13 22 10 18 7 11 7 8 14ZM2 18 14 19 10 22 14 25 21 24 24 18 29 19 26 27 17 31 8 28 5 25 2 28ZM8 7 11 5 10 7ZM22 26 24 23 22 24Z',
  logout: 'M3 3 18 2 18 8 15 8 15 6 7 7 7 25 15 26 15 23 18 23 18 30 3 29ZM17 12 23 12 23 7 31 16 23 25 23 20 12 20 12 13ZM8 9 10 9 10 23 8 24Z',
  settings: 'M12 2 20 2 21 7 25 6 29 12 25 16 29 20 25 27 20 25 19 30 12 30 10 25 6 27 2 20 7 16 3 12 6 5 11 7ZM16 9 10 12 9 18 14 23 21 21 23 15 20 10ZM16 13 20 16 17 20 13 17ZM14 5H18L17 7H14ZM6 19 8 21 8 23 5 20Z',
  check: 'M2 16 6 12 12 19 25 3 30 7 13 30 8 26ZM7 17 12 23 12 25 5 18ZM24 8 17 18 19 17 26 9Z',
});

const aliases = Object.freeze({ folio: 'record', hood: 'helm', home: 'gate', copy: 'duplicate' });
const resolve = name => Object.hasOwn(cuts, name) ? name : Object.hasOwn(aliases, name) ? aliases[name] : 'record';
const classes = value => String(value || '').split(/\s+/).filter(part => /^[a-zA-Z_][\w-]*$/.test(part)).join(' ');

/** Decorative SVG only: accessible names remain on the surrounding control. */
export function icon(name, cls = '') {
  const key = resolve(name);
  return `<svg class="icon ink-icon icon--${key}${classes(cls) ? ` ${classes(cls)}` : ''}" viewBox="0 0 32 32" width="32" height="32" fill="currentColor" stroke="none" fill-rule="evenodd" clip-rule="evenodd" aria-hidden="true" focusable="false"><path d="${cuts[key]}"/></svg>`;
}

/** Replace a control's label without parsing user text or removing its name. */
export function setButtonLabel(button, text, name = button?.dataset?.icon) {
  if (!button) return;
  const doc = button.ownerDocument || globalThis.document;
  const previous = button.querySelector?.('.button-label');
  const source = previous?.getAttribute?.('data-i18n');
  const preserveSource = source !== undefined && source !== null && previous.textContent === String(text ?? '');
  const key = resolve(name);
  const symbol = doc.createElement('span');
  symbol.className = 'button-symbol';
  symbol.setAttribute('aria-hidden', 'true');
  symbol.innerHTML = icon(key);
  const label = doc.createElement('span');
  label.className = 'button-label';
  label.textContent = String(text ?? '');
  if (preserveSource) label.setAttribute('data-i18n', source);
  button.dataset.icon = key;
  button.replaceChildren(symbol, label);
}

/** Idempotent enhancement for static controls and newly rendered dialogs. */
export function mountButtonIcons(root = globalThis.document) {
  root?.querySelectorAll('[data-icon]').forEach(button => {
    const iconOnly = /(?:^|\s)icon-button(?:\s|$)/.test(button.className) && button.hasAttribute('aria-label');
    const label = button.querySelector('.button-label');
    setButtonLabel(button, iconOnly ? '' : (label?.textContent ?? button.textContent).trim(), button.dataset.icon);
  });
}
