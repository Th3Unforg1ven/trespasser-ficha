import test from 'node:test';
import assert from 'node:assert/strict';
import { rememberHavenReturn, consumeHavenReturn } from '../dist/auth-return.js';

const storage = () => {
  const map = new Map();
  return { map, getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) };
};
test('OAuth destination has an expiry, is single use and cannot point outside the haven register', () => {
  const s = storage();
  assert.equal(rememberHavenReturn(s, 1000), true);
  assert.equal(consumeHavenReturn(s, { authReturn: false, now: 2000 }), false);
  assert.equal(s.map.size, 1);
  assert.equal(consumeHavenReturn(s, { authReturn: true, now: 2000 }), true);
  assert.equal(consumeHavenReturn(s, { authReturn: true, now: 2000 }), false);
  rememberHavenReturn(s, 1000);
  assert.equal(consumeHavenReturn(s, { authReturn: true, now: 901001 }), false);
  s.setItem('trespasser.auth.destination.v1', JSON.stringify({ destination: 'https://outside.test/', createdAt: 1000 }));
  assert.equal(consumeHavenReturn(s, { authReturn: true, now: 2000 }), false);
});
test('unavailable browser storage does not break the normal login', () => {
  const s = { setItem() { throw Error('denied'); }, getItem() { throw Error('denied'); } };
  assert.equal(rememberHavenReturn(s), false);
  assert.equal(consumeHavenReturn(s, { authReturn: true }), false);
});
