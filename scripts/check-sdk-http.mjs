import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createCloudClient } from '../dist/cloud-client.js';

// Real vendored SDK + real HTTP on loopback. This is a transport fixture, not
// evidence of Supabase authentication/RLS: the local server owns no real data.
const sdkFactory = globalThis.supabase.createClient;
const accountA = { user: { id: 'account-a' }, access_token: 'fixture-token-a' };
const accountB = { user: { id: 'account-b' }, access_token: 'fixture-token-b' };

async function fixture(t, { reply = () => [], getSession, timeoutMs = 1000 } = {}) {
  const requests = [];
  const http = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    const captured = { method: request.method, url: new URL(request.url, 'http://localhost'), headers: request.headers, body: body ? JSON.parse(body) : null };
    requests.push(captured);
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(reply(captured)));
  });
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
  t.after(() => { http.closeAllConnections(); http.close(); });
  const cloud = createCloudClient({
    url: `http://127.0.0.1:${http.address().port}`,
    publishableKey: 'sb_publishable_loopback-transport-fixture',
  }, {
    requestTimeoutMs: timeoutMs,
    createClient: (url, key, options) => sdkFactory(url, key, {
      ...options,
      auth: { ...options.auth, storageKey: `transport-fixture-${http.address().port}`, persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }),
  });
  // Only auth is a fixture. PostgREST builders, SDK token injection, fetch, HTTP
  // serialization and the production adapter are all the actual implementations.
  cloud.auth.getSession = getSession || (async () => ({ data: { session: accountA }, error: null }));
  return { cloud, requests, adapter: cloud.adapter.forUser('account-a') };
}

test('real SDK serializes account-scoped list and RPC headers/body over HTTP', async t => {
  const saved = { id: 'hero', data: { id: 'hero', name: 'Conceição' }, revision: 2, deleted_at: null };
  const f = await fixture(t, { reply: request => request.method === 'POST' ? [saved] : [] });
  assert.deepEqual(await f.adapter.list(), []);
  assert.deepEqual(await f.adapter.save({ id: 'hero', data: saved.data, revision: 1 }), saved);
  assert.equal(f.requests.length, 2);
  const [list, write] = f.requests;
  assert.equal(list.method, 'GET');
  assert.equal(list.url.pathname, '/rest/v1/trespasser_characters');
  assert.equal(list.url.searchParams.get('select'), 'id,data,revision,deleted_at,updated_at');
  assert.equal(list.url.searchParams.get('order'), 'id.asc');
  assert.equal(list.url.searchParams.get('offset'), '0');
  assert.equal(list.url.searchParams.get('limit'), '500');
  assert.equal(write.method, 'POST');
  assert.equal(write.url.pathname, '/rest/v1/rpc/trespasser_save_character');
  assert.equal(write.headers['content-type'], 'application/json');
  assert.deepEqual(write.body, { p_id: 'hero', p_data: saved.data, p_expected_revision: 1, p_deleted: false });
  for (const request of f.requests) {
    assert.equal(request.headers.authorization, 'Bearer fixture-token-a');
    assert.equal(request.headers.apikey, 'sb_publishable_loopback-transport-fixture');
  }
});

test('real SDK keeps the captured A header when its lazy token lookup sees B', async t => {
  let sessionCalls = 0;
  const f = await fixture(t, { getSession: async () => ({ data: { session: ++sessionCalls === 1 ? accountA : accountB }, error: null }) });
  assert.equal(await f.adapter.save({ id: 'hero', data: { id: 'hero' }, revision: 0 }), null);
  assert.equal(sessionCalls, 2);
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].headers.authorization, 'Bearer fixture-token-a');
});

test('real SDK token wait is bounded and never sends a query after its deadline', async t => {
  let sessionCalls = 0, release;
  const stalled = new Promise(resolve => { release = resolve; });
  const f = await fixture(t, { timeoutMs: 25, getSession: () => {
    sessionCalls++;
    return sessionCalls === 1 ? Promise.resolve({ data: { session: accountA }, error: null }) : stalled;
  } });
  await assert.rejects(f.adapter.list(), error => error.code === 'NETWORK_TIMEOUT');
  release({ data: { session: accountB }, error: null });
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(f.requests.length, 0);
});
