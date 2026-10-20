import test from 'node:test';
import assert from 'node:assert/strict';
import { CloudSync } from '../dist/cloud-sync.js';
import { createCharacter } from '../dist/model.js';

const clone = value => JSON.parse(JSON.stringify(value));
const character = (id = 'hero', name = 'João') => ({ ...createCharacter(name), id });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const memoryStorage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), values };
};

function server(initial = []) {
  const rows = new Map(initial.map(data => [data.id, { id: data.id, data: clone(data), revision: 1, deleted_at: null }]));
  const calls = { list: 0, saves: [] };
  const adapter = {
    async list() { calls.list++; return clone([...rows.values()]); },
    async save(sent) {
      calls.saves.push(clone(sent));
      const existing = rows.get(sent.id);
      if ((existing?.revision ?? 0) !== sent.revision) return null;
      const row = { id: sent.id, data: clone(sent.data), revision: sent.revision + 1, deleted_at: sent.deleted ? '2026-10-19T12:00:00.000Z' : null };
      rows.set(sent.id, row);
      return clone(row);
    },
  };
  return { rows, calls, adapter };
}

function client(backend, options = {}) {
  const changes = [], statuses = [], conflicts = [];
  let next = 0;
  const storage = options.storage || memoryStorage();
  const engine = new CloudSync({
    adapter: backend.adapter, storage, cacheKey: 'account:user-1',
    onChange: value => changes.push(value), onStatus: value => statuses.push(value), onConflict: value => conflicts.push(value),
    makeId: () => `${options.prefix || 'copy'}-${++next}`, ...options,
  });
  return { engine, changes, statuses, conflicts, storage };
}

function edit(engine, change, activeId) {
  const snapshot = engine.getSnapshot();
  change(snapshot.records);
  engine.setRecords(snapshot.records, activeId ?? snapshot.activeId);
}

test('new records upload with insert CAS and account cache is preferred on reload', async () => {
  const backend = server(), first = client(backend);
  await first.engine.start({ records: [character()], activeId: 'hero' });
  assert.equal(backend.rows.get('hero').revision, 1);
  assert.equal(backend.calls.saves[0].revision, 0);
  const cache = JSON.parse(first.storage.getItem('account:user-1'));
  assert.equal(cache.rows[0].revision, 1);
  first.engine.stop();
  const second = client(backend, { storage: first.storage });
  await second.engine.start({ records: [character('ignored')] });
  assert.deepEqual(second.engine.getSnapshot().records.map(record => record.id), ['hero']);
  assert.equal(backend.rows.has('ignored'), false);
  assert.equal(second.statuses.at(-1).state, 'synced');
});

test('two devices combine disjoint edits and recover a CAS race without overwriting', async () => {
  const backend = server([character()]), a = client(backend, { prefix: 'a' }), b = client(backend, { prefix: 'b' });
  await Promise.all([a.engine.start(), b.engine.start()]);
  edit(a.engine, records => { records[0].resources.hp = 0; });
  edit(b.engine, records => { records[0].notes = 'Anotação feita no celular'; });
  await Promise.all([a.engine.sync(), b.engine.sync()]);
  await a.engine.sync();
  assert.equal(backend.rows.get('hero').data.resources.hp, 0);
  assert.equal(backend.rows.get('hero').data.notes, 'Anotação feita no celular');
  assert.equal(backend.rows.get('hero').revision, 3);
  assert.deepEqual(a.engine.getSnapshot(), b.engine.getSnapshot());
  assert.deepEqual(a.conflicts.concat(b.conflicts), []);
});

test('conflicting fields retain cloud original plus named local copy and active selection', async () => {
  const backend = server([character()]), a = client(backend, { prefix: 'a' }), b = client(backend, { prefix: 'b' });
  await Promise.all([a.engine.start(), b.engine.start()]);
  edit(a.engine, records => { records[0].resources.hp = 8; records[0].notes = 'Também preservar'; });
  await a.engine.sync();
  edit(b.engine, records => { records[0].resources.hp = 7; });
  await b.engine.sync();
  assert.equal(backend.rows.get('hero').data.resources.hp, 8);
  assert.equal(backend.rows.get('b-1').data.resources.hp, 7);
  assert.equal(backend.rows.get('b-1').data.notes, 'Também preservar');
  assert.equal(backend.rows.get('b-1').data.name, 'João (conflito)');
  assert.equal(b.engine.getSnapshot().activeId, 'b-1');
  assert.equal(b.conflicts.length, 1);
  assert.deepEqual(b.conflicts[0].paths, ['resources.hp']);
});

test('offline edits and deletions survive reload and retry without importing JSON', async () => {
  const backend = server([character(), character('second')]), device = client(backend);
  await device.engine.start();
  edit(device.engine, records => { records[0].notes = 'Sem conexão'; records.pop(); });
  const normalList = backend.adapter.list;
  backend.adapter.list = async () => { throw new Error('Network disconnected'); };
  await device.engine.sync();
  assert.equal(device.statuses.at(-1).state, 'offline');
  assert.equal(device.statuses.at(-1).pending, 2);
  device.engine.stop();
  const reloaded = client(backend, { storage: device.storage });
  await reloaded.engine.start();
  assert.equal(reloaded.engine.getSnapshot().records[0].notes, 'Sem conexão');
  assert.equal(reloaded.engine.getSnapshot().records.length, 1);
  backend.adapter.list = normalList;
  await reloaded.engine.sync();
  assert.equal(backend.rows.get('hero').data.notes, 'Sem conexão');
  assert.ok(backend.rows.get('second').deleted_at);
  assert.equal(reloaded.statuses.at(-1).pending, 0);
});

test('local deletion is restored when a different device modified that record', async () => {
  const backend = server([character()]), a = client(backend), b = client(backend);
  await Promise.all([a.engine.start(), b.engine.start()]);
  a.engine.setRecords([], null);
  edit(b.engine, records => { records[0].notes = 'Não perder'; });
  await b.engine.sync();
  await a.engine.sync();
  assert.equal(backend.rows.get('hero').deleted_at, null);
  assert.equal(a.engine.getSnapshot().records[0].notes, 'Não perder');
  assert.equal(a.conflicts[0].type, 'delete-modified');
});

test('remote deletion removes unchanged local record and never resurrects its ID', async () => {
  const backend = server([character()]), a = client(backend), b = client(backend);
  await Promise.all([a.engine.start(), b.engine.start()]);
  a.engine.setRecords([], null);
  await a.engine.sync();
  await b.engine.sync();
  assert.deepEqual(b.engine.getSnapshot(), { records: [], activeId: null });
  assert.equal(b.conflicts.length, 0);
  assert.equal(backend.rows.get('hero').revision, 2);
});

test('remote deletion preserves unsynced local changes under a new ID', async () => {
  const backend = server([character()]), a = client(backend, { prefix: 'a' }), b = client(backend, { prefix: 'b' });
  await Promise.all([a.engine.start(), b.engine.start()]);
  edit(b.engine, records => { records[0].notes = 'Salvar mesmo após exclusão'; });
  a.engine.setRecords([], null);
  await a.engine.sync();
  await b.engine.sync();
  assert.ok(backend.rows.get('hero').deleted_at);
  assert.equal(backend.rows.get('b-1').data.notes, 'Salvar mesmo após exclusão');
  assert.equal(b.engine.getSnapshot().records.length, 1);
  assert.equal(b.conflicts[0].type, 'remote-deleted');
});

test('authoritative missing old row preserves a new copy instead of stale-ID resurrection', async () => {
  const backend = server([character()]), device = client(backend);
  await device.engine.start();
  backend.rows.delete('hero');
  await device.engine.sync();
  assert.equal(backend.rows.has('hero'), false);
  assert.equal(backend.rows.get('copy-1').data.name, 'João (conflito)');
  assert.equal(device.conflicts[0].type, 'missing-remote');
});

test('new local ID collision preserves both versions and matching collision simply acknowledges', async () => {
  const backend = server([character()]), device = client(backend);
  const local = character();
  local.notes = 'Diferente';
  await device.engine.start({ records: [local], activeId: 'hero' });
  assert.equal(backend.rows.get('hero').data.notes, '');
  assert.equal(backend.rows.get('copy-1').data.notes, 'Diferente');
  assert.equal(device.conflicts[0].type, 'id-collision');
  const sameDevice = client(backend);
  await sameDevice.engine.start({ records: [character()] });
  assert.equal(sameDevice.conflicts.length, 0);
  assert.equal(backend.rows.size, 2);
});

test('keystrokes during save remain dirty against the sent snapshot and flush next revision', async () => {
  const backend = server([character()]), device = client(backend);
  await device.engine.start();
  const entered = deferred(), release = deferred();
  const originalSave = backend.adapter.save;
  let held = false;
  backend.adapter.save = async request => {
    if (!held) { held = true; entered.resolve(); await release.promise; }
    return originalSave(request);
  };
  edit(device.engine, records => { records[0].notes = 'Primeira'; });
  const syncing = device.engine.sync();
  await entered.promise;
  edit(device.engine, records => { records[0].notes = 'Digitado durante envio'; });
  assert.equal(device.engine.sync(), syncing);
  release.resolve();
  await syncing;
  assert.equal(device.engine.getSnapshot().records[0].notes, 'Digitado durante envio');
  assert.equal(backend.rows.get('hero').data.notes, 'Digitado durante envio');
  assert.equal(backend.rows.get('hero').revision, 3);
  assert.equal(device.conflicts.length, 0);
});

test('local deletion while a save is in flight is sent after that write, not discarded', async () => {
  const backend = server([character()]), device = client(backend);
  await device.engine.start();
  const entered = deferred(), release = deferred(), originalSave = backend.adapter.save;
  let held = false;
  backend.adapter.save = async request => {
    if (!held) { held = true; entered.resolve(); await release.promise; }
    return originalSave(request);
  };
  edit(device.engine, records => { records[0].notes = 'Último envio'; });
  const syncing = device.engine.sync();
  await entered.promise;
  device.engine.setRecords([], null);
  release.resolve();
  await syncing;
  assert.ok(backend.rows.get('hero').deleted_at);
  assert.deepEqual(device.engine.getSnapshot().records, []);
});

test('recreating a record during an in-flight deletion makes a safe new-ID copy', async () => {
  const backend = server([character()]), device = client(backend);
  await device.engine.start();
  const entered = deferred(), release = deferred(), originalSave = backend.adapter.save;
  backend.adapter.save = async request => { if (request.deleted) { entered.resolve(); await release.promise; } return originalSave(request); };
  device.engine.setRecords([], null);
  const syncing = device.engine.sync();
  await entered.promise;
  device.engine.setRecords([character()], 'hero');
  release.resolve();
  await syncing;
  assert.ok(backend.rows.get('hero').deleted_at);
  assert.equal(backend.rows.get('copy-1').data.name, 'João (conflito)');
  assert.equal(device.conflicts[0].type, 'delete-in-flight');
});

test('save network failure retains dirty cache and retry can acknowledge an uncertain successful write', async () => {
  const backend = server([character()]), device = client(backend);
  await device.engine.start();
  const originalSave = backend.adapter.save;
  backend.adapter.save = async request => { await originalSave(request); throw new Error('Response lost'); };
  edit(device.engine, records => { records[0].notes = 'Resposta perdida'; });
  await device.engine.sync();
  assert.equal(device.statuses.at(-1).pending, 1);
  assert.equal(device.engine.getSnapshot().records[0].notes, 'Resposta perdida');
  backend.adapter.save = originalSave;
  await device.engine.sync();
  assert.equal(device.statuses.at(-1).pending, 0);
  assert.equal(device.conflicts.length, 0);
  assert.equal(backend.rows.get('hero').revision, 2);
});

test('unchanged pulls and save acknowledgements do not rerender and snapshots are isolated', async () => {
  const backend = server([character()]), device = client(backend);
  await device.engine.start();
  const count = device.changes.length;
  await device.engine.sync();
  edit(device.engine, records => { records[0].notes = 'Local'; });
  await device.engine.sync();
  assert.equal(device.changes.length, count);
  const snapshot = device.engine.getSnapshot();
  snapshot.records[0].notes = 'Não modificar engine';
  assert.equal(device.engine.getSnapshot().records[0].notes, 'Local');
  device.changes.at(-1).records[0].notes = 'Callback isolado';
  assert.equal(device.engine.getSnapshot().records[0].notes, 'Local');
});

test('stop ignores late list and save responses including callbacks and cache writes', async () => {
  const backend = server([character()]), listRelease = deferred(), device = client(backend);
  backend.adapter.list = () => listRelease.promise;
  const starting = device.engine.start();
  device.engine.stop();
  const before = { changes: device.changes.length, statuses: device.statuses.length, cache: device.storage.getItem('account:user-1'), snapshot: device.engine.getSnapshot() };
  listRelease.resolve(clone([...backend.rows.values()]));
  await starting;
  assert.equal(device.changes.length, before.changes);
  assert.equal(device.statuses.length, before.statuses);
  assert.equal(device.storage.getItem('account:user-1'), before.cache);
  assert.deepEqual(device.engine.getSnapshot(), before.snapshot);

  backend.adapter.list = async () => clone([...backend.rows.values()]);
  await device.engine.start();
  const saveEntered = deferred(), saveRelease = deferred(), originalSave = backend.adapter.save;
  backend.adapter.save = async request => { saveEntered.resolve(); await saveRelease.promise; return originalSave(request); };
  edit(device.engine, records => { records[0].notes = 'Ainda não confirmado'; });
  const saving = device.engine.sync();
  await saveEntered.promise;
  device.engine.stop();
  const cache = device.storage.getItem('account:user-1'), statuses = device.statuses.length;
  saveRelease.resolve();
  await saving;
  assert.equal(device.storage.getItem('account:user-1'), cache);
  assert.equal(device.statuses.length, statuses);
});

test('persistent CAS contention is bounded, leaves edits pending, and never falls back to overwrite', async () => {
  const backend = server([character()]), device = client(backend);
  await device.engine.start();
  backend.adapter.save = async request => { backend.calls.saves.push(request); return null; };
  edit(device.engine, records => { records[0].notes = 'Pendente'; });
  const priorLists = backend.calls.list;
  await device.engine.sync();
  assert.equal(backend.calls.list - priorLists, 2);
  assert.equal(backend.calls.saves.length, 2);
  assert.equal(backend.rows.get('hero').data.notes, '');
  assert.equal(device.statuses.at(-1).pending, 1);
  assert.equal(device.statuses.at(-1).state, 'error');
});

test('corrupt cache is backed up and storage quota failures keep edits in memory', async () => {
  const backend = server([character()]), storage = memoryStorage();
  storage.setItem('account:user-1', '{broken-json');
  const device = client(backend, { storage });
  await device.engine.start();
  assert.equal(storage.getItem('account:user-1.recovery'), '{broken-json');
  assert.equal(device.engine.getSnapshot().records.length, 1);
  assert.equal(device.conflicts[0].type, 'cache-recovery');
  storage.setItem = () => { throw new Error('Quota exceeded'); };
  edit(device.engine, records => { records[0].notes = 'Ainda em memória'; });
  assert.equal(device.engine.getSnapshot().records[0].notes, 'Ainda em memória');
  assert.equal(device.statuses.at(-1).state, 'error');
  assert.equal(device.statuses.at(-1).localSaved, false);
  await device.engine.sync();
  assert.equal(backend.rows.get('hero').data.notes, 'Ainda em memória');
  assert.equal(device.statuses.at(-1).pending, 0);
});

test('empty cache stays empty and user-specific cache keys do not mix account records', async () => {
  const storage = memoryStorage(), backend = server();
  const a = client(backend, { storage });
  await a.engine.start();
  a.engine.stop();
  const sameUser = client(backend, { storage });
  await sameUser.engine.start({ records: [character('guest')] });
  assert.deepEqual(sameUser.engine.getSnapshot().records, []);
  const otherUser = client(server(), { storage, cacheKey: 'account:user-2' });
  await otherUser.engine.start({ records: [character('other-user')] });
  assert.equal(otherUser.engine.getSnapshot().records[0].id, 'other-user');
  assert.deepEqual(JSON.parse(storage.getItem('account:user-1')).records, []);
});
