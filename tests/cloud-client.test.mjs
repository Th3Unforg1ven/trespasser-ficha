import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudClient } from '../dist/cloud-client.js';

const config = {
  url: 'https://example.supabase.co/',
  publishableKey: 'sb_publishable_public-test-key',
  table: 'trespasser_characters',
  rpc: 'trespasser_save_character',
};
const row = id => ({ id, data: { id, name: 'João' }, revision: 1, deleted_at: null, updated_at: '2026-10-19T00:00:00Z' });

function fixture({ list = () => ({ data: [], error: null }), save = () => ({ data: [], error: null }) } = {}) {
  const calls = [];
  const auth = {};
  const client = {
    auth,
    from(table) {
      let columns;
      let order;
      return {
        select(value) { columns = value; return this; },
        order(...args) { order = args; return this; },
        async range(from, to) { calls.push({ type: 'list', table, columns, order, from, to }); return list(from, to); },
      };
    },
    async rpc(name, args) { calls.push({ type: 'save', name, args }); return save(args); },
  };
  let initialization;
  const cloud = createCloudClient(config, { createClient: (...args) => { initialization = args; return client; } });
  return { ...cloud, calls, initialization, expectedAuth: auth };
}

test('vendored SDK exposes its factory in an ES module and auth has isolated persistent implicit sessions', () => {
  assert.equal(typeof globalThis.supabase?.createClient, 'function');
  const f = fixture();
  assert.strictEqual(f.auth, f.expectedAuth);
  assert.equal(f.initialization[0], 'https://example.supabase.co');
  assert.equal(f.initialization[1], config.publishableKey);
  assert.deepEqual(f.initialization[2].auth, {
    storageKey: 'trespasser.auth.v1', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit',
  });
  assert.equal(typeof f.initialization[2].global.fetch, 'function');
});

test('list reads all pages, keeps deletion tombstones and sends no owner supplied by the client', async () => {
  const rows = Array.from({ length: 501 }, (_, i) => row(`id-${i}`));
  rows[500].deleted_at = '2026-10-19T00:01:00Z';
  const f = fixture({ list: (from, to) => ({ data: rows.slice(from, to + 1), error: null }) });
  assert.deepEqual(await f.adapter.list(), rows);
  assert.deepEqual(f.calls.map(({ from, to }) => [from, to]), [[0, 499], [500, 999]]);
  for (const call of f.calls) {
    assert.equal(call.table, config.table);
    assert.equal(call.columns, 'id,data,revision,deleted_at,updated_at');
    assert.deepEqual(call.order, ['id', { ascending: true }]);
    assert.equal(Object.hasOwn(call, 'user_id'), false);
  }
});

test('list distinguishes exactly the maximum from a truncated account and never returns partial results', async () => {
  const page = Array.from({ length: 500 }, (_, i) => row(`id-${i}`));
  const exact = fixture({ list: from => ({ data: from < 10000 ? page : [], error: null }) });
  assert.equal((await exact.adapter.list()).length, 10000);
  assert.equal(exact.calls.length, 21);
  const overflow = fixture({ list: () => ({ data: page, error: null }) });
  await assert.rejects(overflow.adapter.list(), /lista completa não foi carregada/);
  assert.equal(overflow.calls.length, 21);
});

test('list throws the original SDK error, including a failure after a successful page', async () => {
  const sdkError = { code: '42501', message: 'Not authorized' };
  const f = fixture({ list: from => from === 0
    ? { data: Array.from({ length: 500 }, (_, i) => row(`id-${i}`)), error: null }
    : { data: null, error: sdkError } });
  await assert.rejects(f.adapter.list(), error => error === sdkError);
  const malformed = fixture({ list: () => ({ data: null, error: null }) });
  await assert.rejects(malformed.adapter.list(), /Resposta de sincronização inválida/);
});

test('save uses CAS RPC with server ownership and returns one acknowledged row or null for conflict', async () => {
  const character = { id: 'personagem', name: 'Conceição' };
  const acknowledged = { ...row(character.id), data: character, revision: 8 };
  const f = fixture({ save: () => ({ data: [acknowledged], error: null }) });
  assert.strictEqual(await f.adapter.save({ id: character.id, data: character, revision: 7 }), acknowledged);
  assert.deepEqual(f.calls, [{ type: 'save', name: config.rpc, args: {
    p_id: character.id, p_data: character, p_expected_revision: 7, p_deleted: false,
  } }]);
  const conflict = fixture();
  assert.equal(await conflict.adapter.save({ id: character.id, data: character, revision: 0, deleted: true }), null);
  assert.equal(conflict.calls[0].args.p_deleted, true);
});

test('save propagates SDK authorization errors and rejects malformed acknowledgements', async () => {
  const sdkError = { code: 'PGRST301', message: 'JWT expired' };
  const payload = { id: 'id', data: { id: 'id' }, revision: 1 };
  const f = fixture({ save: () => ({ data: null, error: sdkError }) });
  await assert.rejects(f.adapter.save(payload), error => error === sdkError);
  for (const saved of [null, {}, [row('id'), row('another')]]) {
    const malformed = fixture({ save: () => ({ data: saved, error: null }) });
    await assert.rejects(malformed.adapter.save(payload), /Resposta de salvamento inválida/);
  }
});

test('invalid pending writes are rejected before invoking the remote RPC', async () => {
  const f = fixture();
  for (const payload of [
    { id: 'id', data: { id: 'other' }, revision: 0 },
    { id: 'id', data: { id: 'id' }, revision: -1 },
    { id: 'id', data: { id: 'id' }, revision: 1.2 },
    { id: 'id', data: { id: 'id' }, revision: 0, deleted: 'false' },
    { id: 'id', data: [], revision: 0 },
    { id: '😀'.repeat(51), data: { id: '😀'.repeat(51) }, revision: 0 },
    { id: ' spaced ', data: { id: ' spaced ' }, revision: 0 },
  ]) await assert.rejects(f.adapter.save(payload), /Dados de sincronização inválidos/);
  assert.equal(f.calls.length, 0);
});

test('configuration refuses secret keys, service-role JWTs, unrelated tables and unsafe endpoints', () => {
  const jwt = role => `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
  const factory = () => ({ auth: {} });
  assert.doesNotThrow(() => createCloudClient({ ...config, publishableKey: jwt('anon') }, { createClient: factory }));
  for (const patch of [
    { publishableKey: 'sb_secret_private' }, { publishableKey: jwt('service_role') },
    { table: 'profiles' }, { rpc: 'delete_users' }, { url: 'http://example.com' },
    { url: 'https://user:password@example.com' }, { url: 'https://example.com?token=private' },
  ]) assert.throws(() => createCloudClient({ ...config, ...patch }, { createClient: factory }));
});

test('network deadline cancels a stalled request and includes a stalled response body', async () => {
  for (const stalledBody of [false, true]) {
    let fetchOptions;
    let sdkOptions;
    createCloudClient(config, {
      createClient: (_url, _key, options) => { sdkOptions = options; return { auth: {} }; },
      requestTimeoutMs: 20,
      fetch: async (_input, options) => {
        fetchOptions = options;
        if (!stalledBody) return new Promise(() => {});
        return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); } }), {
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });
    await assert.rejects(sdkOptions.global.fetch('https://example.supabase.co/rest/v1/test'), error => error.code === 'NETWORK_TIMEOUT');
    assert.equal(fetchOptions.signal.aborted, true);
  }
});

test('network wrapper keeps JSON responses and caller cancellation intact', async () => {
  let sdkOptions;
  createCloudClient(config, {
    createClient: (_url, _key, options) => { sdkOptions = options; return { auth: {} }; },
    fetch: async () => new Response('{"message":"ação"}', { status: 201, headers: { 'Content-Type': 'application/json', 'X-Test': 'yes' } }),
  });
  const response = await sdkOptions.global.fetch('https://example.supabase.co/rest/v1/test');
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('X-Test'), 'yes');
  assert.deepEqual(await response.json(), { message: 'ação' });
  const controller = new AbortController();
  const reason = new Error('Caller cancelled');
  controller.abort(reason);
  await assert.rejects(sdkOptions.global.fetch('https://example.supabase.co/rest/v1/test', { signal: controller.signal }), error => error === reason);
});

function scopedFixture({ session = { user: { id: 'account-a' }, access_token: 'token-a' }, execute = async () => ({ data: [], error: null }), getSession } = {}) {
  let currentSession = session;
  const queries = [], sent = [];
  function builder(type, args) {
    const request = { type, args, headers: new Headers(), signal: null };
    queries.push(request);
    return {
      setHeader(name, value) { request.headers.set(name, value); return this; },
      abortSignal(signal) { request.signal = signal; return this; },
      select() { return this; }, order() { return this; }, range(from, to) { request.range = [from, to]; return this; },
      then(resolve, reject) {
        return execute(request, () => {
          if (request.signal?.aborted) throw request.signal.reason;
          sent.push({ ...request, authorization: request.headers.get('Authorization') || `Bearer ${currentSession?.access_token}` });
        }).then(resolve, reject);
      },
    };
  }
  const cloud = createCloudClient(config, { createClient: () => ({
    auth: { getSession: getSession || (async () => ({ data: { session: currentSession }, error: null })) },
    from: table => builder('list', table), rpc: (name, args) => builder('save', { name, args }),
  }), requestTimeoutMs: 25 });
  return { ...cloud, queries, sent, setSession: value => { currentSession = value; } };
}

test('account-scoped operations refuse a different or missing session before building queries', async () => {
  for (const session of [null, { user: { id: 'account-b' }, access_token: 'token-b' }]) {
    const f = scopedFixture({ session });
    const adapter = f.adapter.forUser('account-a');
    await assert.rejects(adapter.list(), error => error.code === 'AUTH_ACCOUNT_CHANGED');
    await assert.rejects(adapter.save({ id: 'hero', data: { id: 'hero' }, revision: 0 }), error => error.status === 401);
    assert.equal(f.queries.length, 0);
  }
});

test('account change during the SDK token wait cannot send A character data under B JWT', async () => {
  let release, entered;
  const gate = new Promise(resolve => { release = resolve; });
  const waiting = new Promise(resolve => { entered = resolve; });
  const f = scopedFixture({ execute: async (_request, send) => {
    entered();
    await gate;
    send();
    return { data: [row('hero')], error: null };
  } });
  const saving = f.adapter.forUser('account-a').save({ id: 'hero', data: { id: 'hero', notes: 'private A notes' }, revision: 0 });
  await waiting;
  f.setSession({ user: { id: 'account-b' }, access_token: 'token-b' });
  release();
  await saving;
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].authorization, 'Bearer token-a');
  assert.equal(f.sent[0].args.args.p_data.notes, 'private A notes');
});

test('a session change between list pages aborts the operation instead of mixing accounts', async () => {
  const f = scopedFixture({ execute: async (_request, send) => {
    send();
    f.setSession({ user: { id: 'account-b' }, access_token: 'token-b' });
    return { data: Array.from({ length: 500 }, (_, index) => row(`hero-${index}`)), error: null };
  } });
  await assert.rejects(f.adapter.forUser('account-a').list(), error => error.code === 'AUTH_ACCOUNT_CHANGED');
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].authorization, 'Bearer token-a');
});

test('scoped deadline covers a stalled getSession and prevents late query construction', async () => {
  let release;
  const session = new Promise(resolve => { release = resolve; });
  const f = scopedFixture({ getSession: () => session });
  await assert.rejects(f.adapter.forUser('account-a').list(), error => error.code === 'NETWORK_TIMEOUT');
  release({ data: { session: { user: { id: 'account-a' }, access_token: 'token-a' } }, error: null });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(f.queries.length, 0);
});

test('scoped deadline also aborts a query stalled in the SDK token refresh', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const f = scopedFixture({ execute: async (_request, send) => {
    await gate;
    send();
    return { data: [], error: null };
  } });
  await assert.rejects(f.adapter.forUser('account-a').list(), error => error.code === 'NETWORK_TIMEOUT');
  assert.equal(f.queries[0].signal.aborted, true);
  release();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(f.sent.length, 0);
});

test('token refresh for the same account is captured afresh on each operation', async () => {
  const f = scopedFixture({ execute: async (_request, send) => { send(); return { data: [], error: null }; } });
  const adapter = f.adapter.forUser('account-a');
  await adapter.list();
  f.setSession({ user: { id: 'account-a' }, access_token: 'refreshed-token-a' });
  await adapter.list();
  assert.deepEqual(f.sent.map(request => request.authorization), ['Bearer token-a', 'Bearer refreshed-token-a']);
});
