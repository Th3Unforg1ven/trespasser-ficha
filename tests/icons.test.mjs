import test from 'node:test';
import assert from 'node:assert/strict';
import { icon, setButtonLabel, mountButtonIcons } from '../dist/icons.js';

function control({ text = 'Entrar', name = 'helm', iconOnly = false } = {}) {
  const htmlWrites = [];
  const doc = { createElement: () => new Element() };
  class Element {
    constructor() { this.ownerDocument = doc;this.dataset = {};this.children = [];this.attributes = new Map();this.className = '';this.value = '';this.html = ''; }
    setAttribute(key, value) { this.attributes.set(key, String(value)); }
    hasAttribute(key) { return this.attributes.has(key); }
    getAttribute(key) { return this.attributes.get(key); }
    set innerHTML(value) { htmlWrites.push(value);this.html = value; }
    get innerHTML() { return this.html; }
    set textContent(value) { this.value = String(value);this.children = []; }
    get textContent() { return this.children.length ? this.children.map(child => child.textContent).join('') : this.value; }
    replaceChildren(...children) { this.children = children;this.value = ''; }
    querySelector(selector) { return this.children.find(child => selector === `.${child.className}`) || null; }
  }
  const button = new Element();button.dataset.icon = name;button.textContent = text;
  if (iconOnly) { button.className = 'icon-button';button.setAttribute('aria-label', 'Fechar'); }
  return { button, htmlWrites, root: { querySelectorAll: () => [button] } };
}

test('SVG symbols are decorative and unknown or inherited names have a safe fallback', () => {
  for (const name of ['record', 'helm', 'torch', 'dice', 'sword', 'import', 'export', 'print', 'rest', 'sync', 'logout']) {
    const svg = icon(name);
    assert.match(svg, /aria-hidden="true"/);
    assert.match(svg, /focusable="false"/);
    assert.doesNotMatch(svg, /<title|<text|<script|href=|undefined/);
  }
  for (const name of ['constructor', '__proto__', 'toString', '"><script>alert(1)</script>']) assert.equal(icon(name), icon('record'));
  assert.doesNotMatch(icon('record', 'nav-icon " onload="alert(1)'), /onload|alert|<script/);
});

test('dynamic label changes retain an accessible name and never parse user text', () => {
  const { button, htmlWrites } = control();
  button.disabled = true;button.setAttribute('aria-busy', 'true');
  const text = '<img src=x onerror=alert(1)> Conta & ficha';
  setButtonLabel(button, text, 'helm');
  assert.equal(button.textContent, text);
  assert.equal(button.children[1].className, 'button-label');
  assert.equal(button.children[0].getAttribute('aria-hidden'), 'true');
  assert.equal(htmlWrites.some(value => value.includes(text)), false);
  assert.equal(button.disabled, true);
  assert.equal(button.getAttribute('aria-busy'), 'true');
  setButtonLabel(button, 'Entrar', 'helm');
  assert.equal(button.textContent, 'Entrar');
  assert.equal(button.children.length, 2);
});

test('mounting twice adds one symbol while icon-only controls keep their aria-label', () => {
  const { button, root } = control();
  mountButtonIcons(root);mountButtonIcons(root);
  assert.equal(button.textContent, 'Entrar');
  assert.equal(button.children.length, 2);
  const iconOnly = control({ text: '×', name: 'close', iconOnly: true });
  mountButtonIcons(iconOnly.root);mountButtonIcons(iconOnly.root);
  assert.equal(iconOnly.button.getAttribute('aria-label'), 'Fechar');
  assert.equal(iconOnly.button.textContent, '');
  assert.equal(iconOnly.button.children.length, 2);
});

test('icon enhancement preserves explicit language sources, while replacing a dynamic status clears stale sources',()=>{
  const {button,root}=control({text:'Exportar',name:'export'});
  setButtonLabel(button,'Exportar');
  const label=button.querySelector('.button-label');label.setAttribute('data-i18n','Exportar');label.textContent='Export';
  mountButtonIcons(root);mountButtonIcons(root);
  assert.equal(button.textContent,'Export');
  assert.equal(button.querySelector('.button-label').getAttribute('data-i18n'),'Exportar');
  setButtonLabel(button,'Preparing…');
  assert.equal(button.querySelector('.button-label').getAttribute('data-i18n'),undefined);
  assert.equal(button.textContent,'Preparing…');
});
