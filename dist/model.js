// Trespasser v2.1.3: rules pp. 11, 22–24, 31, 44–45, 71, 75, 86, 88–90.
// Calling features and house rules are entered as explicit manual bonuses.
import { normalizePortrait } from './portrait.js';

// Common Plights, Trespasser v2.1.3, p. 58. These are manual selections;
// marking one does not silently change the character's calculated values.
export const PLIGHTS = Object.freeze([
  { key: 'afraid', pt: 'Amedrontado', en: 'Afraid', descriptionPt: 'Não pode escolher faíscas quick ou striking em testes.', descriptionEn: 'Cannot choose quick or striking sparks on checks.' },
  { key: 'angry', pt: 'Enfurecido', en: 'Angry', descriptionPt: 'Não pode escolher faíscas canny, quiet ou safe em testes.', descriptionEn: 'Cannot choose canny, quiet, or safe sparks on checks.' },
  { key: 'befuddled', pt: 'Confuso', en: 'Befuddled', descriptionPt: 'Não soma bônus em testes de Intellect ou Spirit.', descriptionEn: 'No bonuses to Intellect or Spirit checks.' },
  { key: 'clumsy', pt: 'Desajeitado', en: 'Clumsy', descriptionPt: 'Costly é uma sombra extra nos testes individuais durante exploração de masmorras.', descriptionEn: 'Costly is an extra shadow on non-group dungeon checks.' },
  { key: 'conspicuous', pt: 'Chamativo', en: 'Conspicuous', descriptionPt: 'Loud é uma sombra extra nos testes individuais durante exploração de masmorras.', descriptionEn: 'Loud is an extra shadow on non-group dungeon checks.' },
  { key: 'discouraged', pt: 'Desencorajado', en: 'Discouraged', descriptionPt: 'Não pode tentar o destino em testes de perícia.', descriptionEn: 'Cannot tempt fate on skill checks.' },
  { key: 'distracted', pt: 'Distraído', en: 'Distracted', descriptionPt: 'Começa o combate com 0 focus.', descriptionEn: 'Start combat with 0 focus.' },
  { key: 'enfeebled', pt: 'Debilitado', en: 'Enfeebled', descriptionPt: 'Capacidade do inventário reduzida à metade.', descriptionEn: 'Inventory size is halved.' },
  { key: 'sickly', pt: 'Enfermiço', en: 'Sickly', descriptionPt: 'Não soma bônus em testes de Might ou Agility.', descriptionEn: 'No bonuses to Might or Agility checks.' },
  { key: 'sluggish', pt: 'Letárgico', en: 'Sluggish', descriptionPt: 'Falha automaticamente na iniciativa; ainda testa iniciativa para recuar normalmente.', descriptionEn: 'Automatically fail initiative checks; retreat initiative still works normally.' },
].map(plight => Object.freeze(plight)));
const PLIGHT_KEYS = new Set(PLIGHTS.map(({ key }) => key));

export function plightSummary(character) {
  const selected = new Set(character.plightSelections || []);
  return [PLIGHTS.filter(({ key }) => selected.has(key)).map(({ pt, en }) => `${pt} / ${en}`).join('; '), character.plights || '']
    .filter(Boolean).join('\n');
}

export const ATTRS = Object.freeze([
  { key: 'might', pt: 'Força', en: 'Might' },
  { key: 'agility', pt: 'Agilidade', en: 'Agility' },
  { key: 'intellect', pt: 'Intelecto', en: 'Intellect' },
  { key: 'spirit', pt: 'Espírito', en: 'Spirit' },
]);

export const SKILLS = Object.freeze([
  { key: 'acrobatics', pt: 'Acrobacia', en: 'Acrobatics' },
  { key: 'alchemy', pt: 'Alquimia', en: 'Alchemy' },
  { key: 'athletics', pt: 'Atletismo', en: 'Athletics' },
  { key: 'crafting', pt: 'Manufatura', en: 'Crafting' },
  { key: 'folklore', pt: 'Folclore', en: 'Folklore' },
  { key: 'letters', pt: 'Letras', en: 'Letters' },
  { key: 'magic', pt: 'Magia', en: 'Magic' },
  { key: 'nature', pt: 'Natureza', en: 'Nature' },
  { key: 'perception', pt: 'Percepção', en: 'Perception' },
  { key: 'speech', pt: 'Oratória', en: 'Speech' },
  { key: 'stealth', pt: 'Furtividade', en: 'Stealth' },
  { key: 'tinkering', pt: 'Engenharia', en: 'Tinkering' },
]);

const ATTR_KEYS = ATTRS.map(({ key }) => key);
const SKILL_KEYS = new Set(SKILLS.map(({ key }) => key));
const BONUS_KEYS = ['hp', 'endurance', 'guard', 'accuracy', 'initiative', 'resist', 'prevail', 'tenacity', 'speed', 'focus'];
const ARMOR_SLOTS = ['head', 'body', 'arms', 'legs', 'outer', 'shield'];
const MAGIC_SLOTS = ['amulet', 'ring', 'talisman'];
const RESOURCE_KEYS = ['hp', 'recovery', 'recoveryTotal', 'endurance', 'focus', 'resolve'];
let fallbackId = 0;

function uid() {
  return globalThis.crypto?.randomUUID?.() || `character-${Date.now().toString(36)}-${++fallbackId}`;
}

export function createCharacter(name = '') {
  const c = {
    id: uid(), name: String(name), player: '', motto: '', lineage: '', pastLife: '',
    calling: '', crafts: '', level: 1, xp: 0,
    attributes: Object.fromEntries(ATTR_KEYS.map(key => [key, 0])),
    keyAttribute: 'might', trained: [],
    resources: { hp: 10, recovery: 10, recoveryTotal: 10, endurance: 10, focus: 2, resolve: 0 },
    bonuses: Object.fromEntries(BONUS_KEYS.map(key => [key, 0])),
    alignments: Array.from({ length: 2 }, () => ({ name: '', affirm: 0, deny: 0 })),
    injuries: Array.from({ length: 3 }, () => ({ name: '', clock: 0 })),
    plights: '', plightSelections: [], portrait: normalizePortrait(), features: '', notes: '', coins: '', inventory: [],
    weapons: Array.from({ length: 2 }, () => ({ name: '', damage: '', range: '', properties: '' })),
    armor: ARMOR_SLOTS.map(slot => ({ slot, name: '', weight: '', ar: 0, die: '', properties: '', spent: false })),
    magicItems: MAGIC_SLOTS.map(slot => ({ slot, name: '', effect: '' })),
    deeds: [], states: {},
  };
  return c;
}

const numeric = value => Number.isFinite(Number(value)) ? Number(value) : 0;

export function derive(c) {
  const level = Math.max(0, Math.min(9, Math.trunc(numeric(c.level))));
  const a = Object.fromEntries(ATTR_KEYS.map(key => [key, numeric(c.attributes?.[key])]));
  const b = Object.fromEntries(BONUS_KEYS.map(key => [key, numeric(c.bonuses?.[key])]));
  const commoner = level === 0;
  const tier = level >= 9 ? 3 : level >= 6 ? 2 : level >= 3 ? 1 : 0;
  const skill = 2 + tier;
  const skillDie = `d${6 + 2 * tier}`;
  const armor = (c.armor || []).reduce((sum, piece) => sum + numeric(piece.ar), 0);
  const heavyArmor = (c.armor || []).filter(piece => piece.slot !== 'shield' && /^(h|heavy|pesada)$/i.test(piece.weight || '')).length;
  const encumbered = armor >= 6;
  const trained = new Set(c.trained || []);
  const key = commoner ? Math.max(a.might, a.agility) : numeric(a[c.keyAttribute]);
  return {
    commoner, skill, skillDie,
    hpMax: Math.max(0, (level + 1) * (5 + a.might) + b.hp),
    enduranceMax: commoner ? 0 : Math.max(0, 10 + a.spirit + b.endurance),
    // This is a daily snapshot. Changing endurance later does not resize this pool.
    recoveryMax: commoner ? 0 : Math.max(0, numeric(c.resources?.recoveryTotal)),
    focusMax: commoner ? 0 : null,
    focusStart: commoner ? 0 : Math.max(0, skill + b.focus),
    armor, heavyArmor, encumbered,
    guard: armor + (encumbered ? 0 : a.agility) + b.guard,
    accuracy: key + skill + b.accuracy,
    initiative: a.agility + skill + b.initiative,
    resist: a.spirit + skill + b.resist,
    prevail: a.intellect + skill + b.prevail,
    tenacity: a.might + a.spirit + b.tenacity,
    speed: Math.max(0, 5 + b.speed),
    speedBonus: encumbered ? 2 : Math.max(2, a.agility),
    explore: a.intellect + (trained.has('perception') ? skill : 0),
    encounter: a.agility + (trained.has('stealth') ? skill : 0),
    slots: 5 + a.might,
    usedSlots: (c.inventory || []).reduce((sum, item) => sum + Math.max(0, numeric(item.slots ?? 1)), 0),
    nextXp: commoner || level === 9 ? null : 10 * (level + 1),
  };
}

function object(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path}: objeto inválido.`);
  return value;
}

function string(value, fallback = '', path = 'Texto', max = 50000) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || value.length > max) throw new Error(`${path}: texto inválido.`);
  return value;
}

function number(value, fallback, path, min = 0, max = 1000000000, integer = false) {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new Error(`${path}: número inválido.`);
  }
  return value;
}

function array(value, fallback, path, max = 1000) {
  if (value === undefined) return fallback;
  if (!Array.isArray(value) || value.length > max) throw new Error(`${path}: lista inválida.`);
  return value;
}

export function normalizeCharacter(input) {
  const data = object(input, 'Ficha');
  const c = createCharacter();
  for (const key of ['id', 'name', 'player', 'motto', 'lineage', 'pastLife', 'calling', 'crafts', 'plights', 'features', 'notes', 'coins']) {
    c[key] = string(data[key], c[key], key);
  }
  if (!c.id) c.id = uid();
  c.portrait = normalizePortrait(data.portrait);
  c.plightSelections = [...new Set(array(data.plightSelections, [], 'Aflições', PLIGHTS.length).map(key => {
    if (!PLIGHT_KEYS.has(key)) throw new Error('Aflição inválida.');
    return key;
  }))];
  c.level = number(data.level, c.level, 'Nível', 0, 9, true);
  c.xp = number(data.xp, 0, 'XP', 0, 1000000000, true);
  const attrs = data.attributes === undefined ? {} : object(data.attributes, 'Atributos');
  for (const key of ATTR_KEYS) c.attributes[key] = number(attrs[key], 0, key, 0, 5, true);
  c.keyAttribute = string(data.keyAttribute, 'might', 'Atributo-chave');
  if (!ATTR_KEYS.includes(c.keyAttribute)) throw new Error('Atributo-chave inválido.');
  c.trained = [...new Set(array(data.trained, [], 'Perícias').map(key => {
    if (!SKILL_KEYS.has(key)) throw new Error('Perícia inválida.');
    return key;
  }))];

  const bonuses = data.bonuses === undefined ? {} : object(data.bonuses, 'Bônus');
  for (const key of BONUS_KEYS) c.bonuses[key] = number(bonuses[key], 0, `Bônus ${key}`, -10000, 10000);
  const calculated = derive(c);
  const defaults = {
    hp: calculated.hpMax, endurance: calculated.enduranceMax,
    recovery: calculated.enduranceMax, recoveryTotal: calculated.enduranceMax,
    focus: calculated.focusStart, resolve: 0,
  };
  const resources = data.resources === undefined ? {} : object(data.resources, 'Recursos');
  for (const key of RESOURCE_KEYS) c.resources[key] = number(resources[key], defaults[key], `Recurso ${key}`, 0, key === 'resolve' ? 3 : 1000000000, true);

  const alignments = array(data.alignments, c.alignments, 'Alinhamentos', 2);
  c.alignments = Array.from({ length: 2 }, (_, index) => {
    const entry = object(alignments[index] || {}, 'Alinhamento');
    return { name: string(entry.name), affirm: number(entry.affirm, 0, 'Afirmações', 0, 3, true), deny: number(entry.deny, 0, 'Negações', 0, 3, true) };
  });
  const injuries = array(data.injuries, c.injuries, 'Ferimentos', 3);
  c.injuries = Array.from({ length: 3 }, (_, index) => {
    const entry = object(injuries[index] || {}, 'Ferimento');
    return { name: string(entry.name), clock: number(entry.clock, 0, 'Relógio', 0, 100, true) };
  });
  c.inventory = array(data.inventory, [], 'Inventário').map(value => {
    const item = object(value, 'Item');
    return { id: string(item.id, uid()), name: string(item.name), slots: number(item.slots, 1, 'Espaços do item', 0, 1000), notes: string(item.notes) };
  });
  const weapons = array(data.weapons, c.weapons, 'Armas', 2);
  c.weapons = Array.from({ length: 2 }, (_, index) => {
    const item = object(weapons[index] || {}, 'Arma');
    return Object.fromEntries(['name', 'damage', 'range', 'properties'].map(key => [key, string(item[key])]));
  });
  const armor = array(data.armor, c.armor, 'Armaduras', 6);
  const seenArmor = new Set();
  for (const value of armor) {
    const item = object(value, 'Armadura');
    if (!ARMOR_SLOTS.includes(item.slot) || seenArmor.has(item.slot)) throw new Error('Posição de armadura inválida ou repetida.');
    seenArmor.add(item.slot);
  }
  c.armor = ARMOR_SLOTS.map(slot => {
    const item = armor.find(entry => entry.slot === slot) || {};
    if (item.spent !== undefined && typeof item.spent !== 'boolean') throw new Error('Dado de armadura inválido.');
    return { slot, name: string(item.name), weight: string(item.weight), ar: number(item.ar, 0, 'Proteção', -100, 100), die: string(item.die), properties: string(item.properties), spent: item.spent ?? false };
  });
  const magicItems = array(data.magicItems, c.magicItems, 'Itens mágicos', 3);
  const seenMagic = new Set();
  for (const value of magicItems) {
    const item = object(value, 'Item mágico');
    if (!MAGIC_SLOTS.includes(item.slot) || seenMagic.has(item.slot)) throw new Error('Posição de item mágico inválida ou repetida.');
    seenMagic.add(item.slot);
  }
  c.magicItems = MAGIC_SLOTS.map(slot => {
    const item = magicItems.find(entry => entry.slot === slot) || {};
    return { slot, name: string(item.name), effect: string(item.effect) };
  });
  c.deeds = array(data.deeds, [], 'Façanhas').map(value => {
    const item = object(value, 'Façanha');
    const kind = string(item.kind, 'light');
    if (!['light', 'heavy', 'mighty', 'special'].includes(kind)) throw new Error('Tipo de façanha inválido.');
    return { id: string(item.id, uid()), name: string(item.name), kind, cost: number(item.cost, kind === 'heavy' ? 2 : kind === 'mighty' ? 4 : 0, 'Custo', 0, 10000, true), focus: number(item.focus, 0, 'Custo crescente', 0, 10000, true), description: string(item.description) };
  });
  const states = data.states === undefined ? {} : object(data.states, 'Estados');
  c.states = Object.create(null);
  if (Object.keys(states).length > 200) throw new Error('Estados demais.');
  for (const [key, intensity] of Object.entries(states)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Estado inválido.');
    c.states[key] = number(intensity, 0, 'Intensidade', 0, 10, true);
  }
  return c;
}

function secureDie(sides) {
  if (!globalThis.crypto?.getRandomValues) throw new Error('Sorteio seguro indisponível neste navegador.');
  const words = new Uint32Array(1);
  const limit = 0x100000000 - (0x100000000 % sides);
  do { globalThis.crypto.getRandomValues(words); } while (words[0] >= limit);
  return (words[0] % sides) + 1;
}

export function rollDice(expression) {
  if (typeof expression !== 'string' || expression.length > 100) throw new Error('Expressão de dados inválida.');
  const source = expression.replace(/\s+/g, '').toLowerCase();
  if (!source || !/^[+-]?(?:\d*d\d+|\d+)(?:[+-](?:\d*d\d+|\d+))*$/.test(source)) throw new Error('Use uma expressão como 1d20+3 ou 2d6.');
  const terms = source.match(/[+-]?(?:\d*d\d+|\d+)/g);
  const rolls = [];
  let total = 0;
  let count = 0;
  // Validate the entire expression before consuming randomness.
  const parsed = terms.map(term => {
    const sign = term.startsWith('-') ? -1 : 1;
    const body = term.replace(/^[+-]/, '');
    if (!body.includes('d')) {
      const value = Number(body);
      if (!Number.isSafeInteger(value) || value > 100000) throw new Error('Modificador grande demais.');
      return { sign, value };
    }
    const [amountText, sidesText] = body.split('d');
    const amount = amountText === '' ? 1 : Number(amountText);
    const sides = Number(sidesText);
    count += amount;
    if (!Number.isSafeInteger(amount) || amount < 1 || count > 100 || !Number.isSafeInteger(sides) || sides < 1 || sides > 1000) throw new Error('Use até 100 dados, com 1 a 1000 faces.');
    return { sign, amount, sides };
  });
  for (const term of parsed) {
    if ('value' in term) total += term.sign * term.value;
    else for (let index = 0; index < term.amount; index++) {
      const roll = term.sign * secureDie(term.sides);
      rolls.push(roll);
      total += roll;
    }
  }
  return { total, rolls, expression: source };
}
