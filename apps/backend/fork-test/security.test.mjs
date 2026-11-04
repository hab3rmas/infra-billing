import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const {
  FailureThrottle,
  isSensitivePath,
  isFailure,
  clientIp,
} = require('../dist/security/login-throttle.js');
const {
  isBlockedAddress,
  hostIsExplicit,
  guardedLookup,
} = require('../dist/remnawave/remnawave.dns.js');

const opts = { windowMs: 1000, baseLockMs: 1000, maxLockMs: 8000, maxEntries: 5 };

test('a key is blocked after the limit and free again after the lock', () => {
  const t = new FailureThrottle(opts);
  assert.equal(t.recordFailure('ip:1', 3, 0), 0);
  assert.equal(t.recordFailure('ip:1', 3, 10), 0);
  assert.equal(t.blockedFor('ip:1', 20), 0);
  assert.equal(t.recordFailure('ip:1', 3, 20), 1000, 'the third failure trips the limit');
  assert.equal(t.blockedFor('ip:1', 500), 520);
  assert.equal(t.blockedFor('ip:1', 1021), 0);
});

test('failures outside the window do not add up', () => {
  const t = new FailureThrottle(opts);
  t.recordFailure('k', 3, 0);
  t.recordFailure('k', 3, 10);
  assert.equal(t.recordFailure('k', 3, 5000), 0, 'the old ones expired');
});

test('every repeated block doubles the lock, up to the cap', () => {
  const t = new FailureThrottle(opts);
  const trip = (now) => {
    t.recordFailure('k', 1, now);
  };
  const locks = [];
  let now = 0;
  for (let i = 0; i < 6; i += 1) {
    locks.push(t.recordFailure('k', 1, now));
    now += locks.at(-1) + 1;
  }
  assert.deepEqual(locks, [1000, 2000, 4000, 8000, 8000, 8000]);
  void trip;
});

test('a success clears the failures of that key', () => {
  const t = new FailureThrottle(opts);
  t.recordFailure('k', 3, 0);
  t.recordFailure('k', 3, 1);
  t.recordSuccess('k');
  assert.equal(t.recordFailure('k', 3, 2), 0);
  assert.equal(t.recordFailure('k', 3, 3), 0);
});

test('memory stays bounded under a flood of random keys', () => {
  const t = new FailureThrottle(opts);
  for (let i = 0; i < 100; i += 1) t.recordFailure(`user:${i}`, 99, i);
  assert.ok(t.size <= 5);
});

test('only sign-in routes and Bearer guesses count', () => {
  for (const p of [
    '/api/auth/login',
    '/api/auth/setup',
    '/api/auth/passkey/login/verify',
    '/api/auth/telegram/callback',
    '/api/auth/login/',
  ]) {
    assert.equal(isSensitivePath(p), true, p);
  }
  for (const p of ['/api/auth/me', '/api/services', '/api/auth/logout', '/api/auth/passkeys']) {
    assert.equal(isSensitivePath(p), false, p);
  }
  assert.equal(isFailure(401, true), true);
  assert.equal(isFailure(400, true), true);
  assert.equal(isFailure(200, true), false);
  assert.equal(isFailure(429, true), false, 'a throttled answer is not a new failure');
  assert.equal(isFailure(401, false), true);
  assert.equal(isFailure(404, false), false, 'a normal 404 is not a token guess');
});

test('X-Forwarded-For is trusted only from a private peer (the proxy)', () => {
  assert.equal(clientIp('172.18.0.3', '203.0.113.9'), '203.0.113.9');
  assert.equal(clientIp('::ffff:172.18.0.3', '203.0.113.9, 10.0.0.1'), '203.0.113.9');
  assert.equal(
    clientIp('198.51.100.7', '203.0.113.9'),
    '198.51.100.7',
    'a direct client cannot spoof it',
  );
  assert.equal(clientIp('127.0.0.1', undefined), '127.0.0.1');
});

test('SSRF guard: metadata and link-local are always refused, loopback only for names', () => {
  for (const a of [
    '169.254.169.254',
    '169.254.0.1',
    'fe80::1',
    '0.0.0.0',
    '::',
    '::ffff:169.254.169.254',
  ]) {
    assert.equal(isBlockedAddress(a, true), true, `${a} (literal)`);
    assert.equal(isBlockedAddress(a, false), true, `${a} (name)`);
  }
  assert.equal(
    isBlockedAddress('127.0.0.1', false),
    true,
    'a public-looking name pointing at loopback',
  );
  assert.equal(
    isBlockedAddress('127.0.0.1', true),
    false,
    'localhost / 127.0.0.1 given explicitly',
  );
  assert.equal(isBlockedAddress('::1', false), true);
  assert.equal(isBlockedAddress('203.0.113.9', false), false);
  assert.equal(isBlockedAddress('10.1.2.3', false), false, 'a panel on a private network is fine');
  assert.equal(hostIsExplicit('localhost'), true);
  assert.equal(hostIsExplicit('127.0.0.1'), true);
  assert.equal(hostIsExplicit('[::1]'), true);
  assert.equal(hostIsExplicit('panel.example.com'), false);
});

test('the connect-time lookup refuses the cloud metadata address', async () => {
  const err = await new Promise((resolve) => {
    guardedLookup('169.254.169.254', {}, (e) => resolve(e));
  });
  assert.equal(err?.code, 'EBLOCKED');
  const ok = await new Promise((resolve) => {
    guardedLookup('127.0.0.1', {}, (e, address) => resolve(e ? `err:${e.code}` : address));
  });
  assert.equal(ok, '127.0.0.1', 'an explicit loopback IP still works');
});
