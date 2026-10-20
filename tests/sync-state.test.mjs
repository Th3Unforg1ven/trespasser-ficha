import test from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter } from '../dist/model.js';
import { characterFingerprint, mergeCharacter, normalizeSyncCharacter, normalizeSyncRecord, recordFingerprint, mergeRecord, MAX_SYNC_BYTES, isSyncCharacterId } from '../dist/sync-state.js';
import { portraitPng } from './portrait-fixture.mjs';

const copy = value => structuredClone(value);
const fixture = () => ({ ...createCharacter('João'), id: 'shared-character' });

test('fingerprints ignore object key ordering and normalize absent schema defaults', () => {
  const original = fixture();
  const reordered = Object.fromEntries(Object.entries(original).reverse());
  reordered.resources = Object.fromEntries(Object.entries(original.resources).reverse());
  assert.equal(characterFingerprint(original), characterFingerprint(reordered));
  assert.equal(characterFingerprint({ id: original.id, name: original.name }), characterFingerprint(original));
  reordered.notes = 'Um avanço.';
  assert.notEqual(characterFingerprint(original), characterFingerprint(reordered));
});

test('disjoint nested edits from two devices combine without refilling resources', () => {
  const base = fixture(), local = copy(base), remote = copy(base);
  local.resources.hp = 0;
  local.attributes.might = 3;
  remote.resources.focus = 0;
  remote.notes = 'Mudança no celular';
  const result = mergeCharacter(base, local, remote);
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.character.resources.hp, 0);
  assert.equal(result.character.resources.focus, 0);
  assert.equal(result.character.attributes.might, 3);
  assert.equal(result.character.notes, 'Mudança no celular');
});

test('same-field divergent edits are reported deterministically and keep local data', () => {
  const base = fixture(), local = copy(base), remote = copy(base);
  local.name = '';
  remote.name = 'Beatriz';
  local.resources.hp = 0;
  remote.resources.hp = 8;
  const { character, conflicts } = mergeCharacter(base, local, remote);
  assert.deepEqual(conflicts, ['name', 'resources.hp']);
  assert.equal(character.name, '');
  assert.equal(character.resources.hp, 0);
});

test('matching concurrent changes and one-sided edits do not conflict', () => {
  const base = fixture(), local = copy(base), remote = copy(base);
  local.name = remote.name = 'Conceição';
  local.inventory = [{ id: 'rope', name: 'Corda', slots: 0, notes: '' }];
  remote.states.poisoned = 1;
  const { character, conflicts } = mergeCharacter(base, local, remote);
  assert.deepEqual(conflicts, []);
  assert.equal(character.name, 'Conceição');
  assert.equal(character.inventory[0].slots, 0);
  assert.equal(character.states.poisoned, 1);
});

test('arrays merge atomically so concurrent reorder/deletion cannot lose item identity', () => {
  const base = fixture();
  base.inventory = [{ id: 'a', name: 'A', slots: 1, notes: '' }, { id: 'b', name: 'B', slots: 1, notes: '' }];
  const local = copy(base), remote = copy(base);
  local.inventory.reverse();
  remote.inventory.pop();
  local.armor[0].spent = false;
  remote.armor[0].spent = true;
  const result = mergeCharacter(base, local, remote);
  assert.deepEqual(result.conflicts, ['inventory']);
  assert.deepEqual(result.character.inventory.map(item => item.id), ['b', 'a']);
  assert.equal(result.character.armor[0].spent, true);
  assert.notEqual(characterFingerprint(base), characterFingerprint(local));
});

test('false boolean and cleared text remain deliberate local edits', () => {
  const base = fixture();
  base.armor[0].spent = true;
  base.notes = 'Apagar';
  const local = copy(base), remote = copy(base);
  local.armor[0].spent = false;
  local.notes = '';
  remote.name = 'Remoto';
  const { character, conflicts } = mergeCharacter(base, local, remote);
  assert.deepEqual(conflicts, []);
  assert.equal(character.armor[0].spent, false);
  assert.equal(character.notes, '');
});

test('state deletion survives and concurrent add/delete is resolved at the state key', () => {
  const base = fixture();
  base.states = { poisoned: 2, dazed: 1 };
  const local = copy(base), remote = copy(base);
  delete local.states.poisoned;
  remote.states.frightened = 3;
  const first = mergeCharacter(base, local, remote);
  assert.deepEqual({ ...first.character.states }, { dazed: 1, frightened: 3 });
  assert.deepEqual(first.conflicts, []);
  remote.states.poisoned = 4;
  const second = mergeCharacter(base, local, remote);
  assert.deepEqual(second.conflicts, ['states.poisoned']);
  assert.equal(Object.hasOwn(second.character.states, 'poisoned'), false);
});

test('new conflicting state preserves local zero rather than treating it as missing', () => {
  const base = fixture(), local = copy(base), remote = copy(base);
  local.states.dazed = 0;
  remote.states.dazed = 1;
  const { character, conflicts } = mergeCharacter(base, local, remote);
  assert.deepEqual(conflicts, ['states.dazed']);
  assert.equal(character.states.dazed, 0);
});

test('merging never mutates or shares references with its sources', () => {
  const base = fixture(), local = copy(base), remote = copy(base);
  local.trained = ['magic'];
  remote.notes = 'Remoto';
  const before = [base, local, remote].map(characterFingerprint);
  const result = mergeCharacter(base, local, remote);
  result.character.resources.hp = 0;
  result.character.armor[0].spent = true;
  result.character.trained.push('letters');
  assert.deepEqual([base, local, remote].map(characterFingerprint), before);
});

test('unsafe prototype keys, custom prototypes and accessors are rejected without executing', () => {
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    const value = JSON.parse(`{"id":"safe","unknown":{"${key}":true}}`);
    assert.throws(() => characterFingerprint(value), /inválido/);
  }
  const inherited = Object.create({ name: 'inherited' });
  inherited.id = 'safe';
  assert.throws(() => normalizeSyncCharacter(inherited), /JSON/);
  let called = false;
  const accessor = { id: 'safe', get notes() { called = true; return ''; } };
  assert.throws(() => normalizeSyncCharacter(accessor), /JSON/);
  assert.equal(called, false);
  assert.equal({}.polluted, undefined);
});

test('invalid schema data and unstable identities cannot enter sync revisions', () => {
  assert.throws(() => characterFingerprint({ name: 'Sem ID' }), /identificador/);
  assert.throws(() => characterFingerprint({ id: 'safe', inventory: [{ name: 'Sem ID' }] }), /identificador/);
  assert.throws(() => characterFingerprint({ id: 'safe', attributes: { might: 6 } }), /número inválido/);
  assert.throws(() => characterFingerprint({ id: 'safe', notes: 'x'.repeat(50_001) }), /grande demais/);
  assert.throws(() => characterFingerprint({ id: 'safe', inventory: Array(1001).fill({ id: 'item' }) }), /lista inválida/);
  assert.throws(() => mergeCharacter(fixture(), fixture(), { ...fixture(), id: 'another' }), /fichas diferentes/);
});

test('bounded JSON traversal and byte size reject oversized or non-JSON snapshots', () => {
  for (const value of [Infinity, NaN, undefined, new Date(), () => {}]) {
    assert.throws(() => characterFingerprint({ id: 'safe', notes: value }), /JSON/);
  }
  const nested = { id: 'safe' };
  let next = nested;
  for (let index = 0; index < 35; index++) next = next.unknown = {};
  assert.throws(() => characterFingerprint(nested), /complexa demais/);
  const large = fixture();
  large.inventory = Array.from({ length: 15 }, (_, index) => ({ id: `large-${index}`, name: '😀'.repeat(25_000), notes: '😀'.repeat(25_000), slots: 1 }));
  assert.ok(new TextEncoder().encode(JSON.stringify(large)).byteLength > MAX_SYNC_BYTES);
  assert.throws(() => characterFingerprint(large), /Ficha grande demais/);
});

test('sparse arrays and extra array properties cannot produce ambiguous fingerprints', () => {
  const sparse = fixture();
  sparse.inventory = Array(2);
  assert.throws(() => characterFingerprint(sparse), /posições ausentes/);
  const extra = fixture();
  extra.inventory.description = 'ignored by JSON.stringify';
  assert.throws(() => characterFingerprint(extra), /JSON/);
});

test('root character IDs match the database UTF-8 byte limit without changing nested IDs', () => {
  for (const id of ['x'.repeat(201), '😀'.repeat(51), ' leading', 'trailing ']) {
    assert.equal(isSyncCharacterId(id), false);
    assert.throws(() => normalizeSyncCharacter({ id }), /identificador inválido/);
  }
  for (const id of ['x'.repeat(200), '😀'.repeat(50)]) assert.equal(normalizeSyncCharacter({ id }).id, id);
  const nestedId = 'item-'.repeat(100);
  const normalized = normalizeSyncCharacter({ id: 'valid', inventory: [{ id: nestedId }] });
  assert.equal(normalized.inventory[0].id, nestedId);
});

test('generic model fingerprints and merge retain non-character fields', () => {
  const normalize = value => {
    if (value.kind !== 'haven') throw new Error('Expected Haven');
    return structuredClone(value);
  };
  const base = { id: 'haven', kind: 'haven', name: 'Porto', attributes: { defense: 1, trade: 2 }, purse: 10, hirelings: [] };
  const local = copy(base), remote = copy(base);
  local.attributes.defense = 3;remote.purse = 0;
  assert.notEqual(recordFingerprint(base, normalize), recordFingerprint(local, normalize));
  const result = mergeRecord(base, local, remote, normalize);
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.record.attributes.defense, 3);
  assert.equal(result.record.purse, 0);
  assert.equal(result.record.kind, 'haven');
  local.hirelings = [{ id: 'a' }];remote.hirelings = [{ id: 'b' }];
  assert.deepEqual(mergeRecord(base, local, remote, normalize).conflicts, ['hirelings']);
});

test('generic normalization isolates mutating callbacks and rejects unstable or unsafe output', () => {
  const source = { id: 'haven', name: 'Original', kind: 'haven', resources: { value: 0 } };
  const normalized = normalizeSyncRecord(source, value => { value.name = 'Normalized';return value; });
  assert.equal(source.name, 'Original');
  normalized.resources.value = 4;
  assert.equal(source.resources.value, 0);
  assert.throws(() => normalizeSyncRecord(source, value => ({ ...value, id: 'different' })), /identificador/);
  assert.throws(() => normalizeSyncRecord(source, () => JSON.parse('{"id":"haven","constructor":true}')), /inválido/);
  assert.throws(() => normalizeSyncRecord({ name: 'No ID' }, value => ({ ...value, id: 'generated' })), /identificador/);
});

test('only character root portraits get a validated image exception to the ordinary string budget', () => {
  const c=createCharacter('Privado'); c.portrait={dataUrl:portraitPng(),zoom:1.5,x:5,y:80};
  assert.ok(c.portrait.dataUrl.length>50_000);
  assert.deepEqual(normalizeSyncCharacter(c).portrait,c.portrait);
  assert.ok(characterFingerprint(c).includes(c.portrait.dataUrl));
  const changed=copy(c);changed.portrait.zoom=2;
  assert.notEqual(characterFingerprint(c),characterFingerprint(changed));
  assert.deepEqual(mergeCharacter(c,changed,c).character.portrait,changed.portrait);
  assert.throws(()=>normalizeSyncRecord({...c,kind:'haven'},value=>value),/Texto grande demais/);
  assert.throws(()=>normalizeSyncCharacter({...c,notes:c.portrait.dataUrl}),/Texto grande demais/);
  assert.throws(()=>normalizeSyncCharacter({...c,portrait:{dataUrl:'x'.repeat(60_000)}}),/Retrato inválido/);
  assert.throws(()=>normalizeSyncCharacter({...c,extra:{portrait:c.portrait}}),/Texto grande demais/);
  assert.throws(()=>normalizeSyncCharacter({...c,'portrait.dataUrl':c.portrait.dataUrl}),/Texto grande demais/);
});

test('a character portrait is an atomic image/crop so simultaneous replacements never invent a new framing', () => {
  const base=createCharacter('Enquadramento');
  base.portrait={dataUrl:portraitPng(60,40),zoom:1,x:50,y:50};
  const local=copy(base),remote=copy(base);
  local.portrait={dataUrl:portraitPng(50,40),zoom:1,x:50,y:50};
  remote.portrait={...base.portrait,zoom:2,x:10};
  const before=[base,local,remote].map(value=>JSON.stringify(value));
  const result=mergeCharacter(base,local,remote);
  assert.deepEqual(result.conflicts,['portrait']);
  assert.deepEqual(result.character.portrait,local.portrait);
  assert.deepEqual([base,local,remote].map(value=>JSON.stringify(value)),before);
  assert.deepEqual(mergeCharacter(base,base,remote).character.portrait,remote.portrait,'one-sided crop applies');
  assert.deepEqual(mergeCharacter(base,local,local).conflicts,[],'matching changes do not conflict');

  // Other record models retain ordinary object merging even when their own
  // unrelated data happens to have the same property name.
  const genericBase={id:'other',portrait:{image:'a',zoom:1}};
  const genericLocal={id:'other',portrait:{image:'b',zoom:1}};
  const genericRemote={id:'other',portrait:{image:'a',zoom:2}};
  const generic=mergeRecord(genericBase,genericLocal,genericRemote,value=>structuredClone(value));
  assert.deepEqual(generic.conflicts,[]);
  assert.deepEqual(generic.record.portrait,{image:'b',zoom:2});
});
