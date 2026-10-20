import { normalizeCharacter } from './model.js';

// Sync snapshots contain only JSON. Keep identity stable: the character model's
// random ID fallbacks are useful for imports, but unsafe for comparing revisions.
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const MISSING = Symbol('missing');
export const MAX_SYNC_BYTES = 2_000_000;

// Match the database's root-id byte limit; nested inventory/deed ids are JSON
// values and do not occupy the character primary key.
export function isSyncCharacterId(value) {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
    && new TextEncoder().encode(value).byteLength <= 200;
}

function isObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function inspectJson(value, budget = { nodes: 0 }, depth = 0) {
  if (++budget.nodes > 30_000 || depth > 32) throw new Error('Ficha grande ou complexa demais para sincronizar.');
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value === 'string') {
    if (value.length > 50_000) throw new Error('Texto grande demais para sincronizar.');
    return;
  }
  if (!Array.isArray(value) && !isObject(value)) throw new Error('A ficha deve conter apenas dados JSON.');
  if (Object.getOwnPropertySymbols(value).length) throw new Error('A ficha deve conter apenas dados JSON.');
  if (Array.isArray(value) && value.length > 1000) throw new Error('Ficha: lista inválida.');
  const entries = Object.entries(Object.getOwnPropertyDescriptors(value));
  for (const [key, descriptor] of entries) {
    if (Array.isArray(value) && key === 'length') continue;
    if (Array.isArray(value) && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length)) throw new Error('A ficha deve conter apenas dados JSON.');
    if (FORBIDDEN_KEYS.has(key)) throw new Error('Campo de ficha inválido.');
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error('A ficha deve conter apenas dados JSON.');
    inspectJson(descriptor.value, budget, depth + 1);
  }
  if (Array.isArray(value) && entries.length !== value.length + 1) throw new Error('A ficha não pode conter listas com posições ausentes.');
}

function requireId(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > 50_000) throw new Error(`${label}: identificador ausente ou inválido.`);
}

/** A new validated character snapshot; never mutates its source. */
export function normalizeSyncCharacter(input) {
  inspectJson(input);
  if (!isObject(input)) throw new Error('Ficha inválida.');
  requireId(input.id, 'Ficha');
  if (!isSyncCharacterId(input.id)) throw new Error('Ficha: identificador inválido; use até 200 bytes, sem espaços nas pontas.');
  for (const key of ['inventory', 'deeds']) {
    if (Array.isArray(input[key])) for (const item of input[key]) requireId(item?.id, key);
  }
  const character = normalizeCharacter(input);
  if (new TextEncoder().encode(JSON.stringify(character)).byteLength > MAX_SYNC_BYTES) throw new Error('Ficha grande demais para sincronizar.');
  return character;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

/** Canonical JSON, not a lossy hash. Object order is ignored; array order matters. */
export function characterFingerprint(input) {
  return canonical(normalizeSyncCharacter(input));
}

function equal(left, right) {
  if (left === MISSING || right === MISSING) return left === right;
  return canonical(left) === canonical(right);
}

function clone(value) {
  if (value === MISSING) return MISSING;
  if (Array.isArray(value)) return value.map(clone);
  if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clone(entry)]));
  return value;
}

function mergeValue(base, local, remote, path, conflicts) {
  if (equal(local, remote)) return clone(local);
  if (equal(local, base)) return clone(remote);
  if (equal(remote, base)) return clone(local);
  if (isObject(local) && isObject(remote) && (base === MISSING || isObject(base))) {
    const merged = {};
    const keys = new Set([...Object.keys(base === MISSING ? {} : base), ...Object.keys(local), ...Object.keys(remote)]);
    for (const key of [...keys].sort()) {
      const value = mergeValue(
        base !== MISSING && Object.hasOwn(base, key) ? base[key] : MISSING,
        Object.hasOwn(local, key) ? local[key] : MISSING,
        Object.hasOwn(remote, key) ? remote[key] : MISSING,
        path ? `${path}.${key}` : key,
        conflicts,
      );
      if (value !== MISSING) merged[key] = value;
    }
    return merged;
  }
  // Arrays are atomic, including equipment and inventory. Never merge their
  // indexes: reordering or deleting a row can otherwise overwrite another item.
  conflicts.push(path);
  return clone(local);
}

/**
 * Three-way merge against the last acknowledged cloud snapshot. Disjoint edits
 * combine automatically. Divergent scalar/array edits keep the local value and
 * return their dotted paths; callers must resolve/preserve conflicts before CAS.
 * Known absent fields use model defaults; deleted optional state keys stay gone.
 */
export function mergeCharacter(base, local, remote) {
  const snapshots = [base, local, remote].map(normalizeSyncCharacter);
  if (new Set(snapshots.map(character => character.id)).size !== 1) throw new Error('Não é possível mesclar fichas diferentes.');
  const conflicts = [];
  const merged = mergeValue(...snapshots, '', conflicts);
  return { character: normalizeSyncCharacter(merged), conflicts };
}
