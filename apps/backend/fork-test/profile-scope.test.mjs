import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const {
  computeScope,
  homeProfileOf,
  notificationScope,
} = require('../dist/profiles/profile-scope.js');
const { scopeWhere, postFilter } = require('../dist/profiles/scoped-prisma.js');

// Profiles VPN (A) and Site (B). Project pv in A, ps in B, po in neither.
// Account hz is shared: default project in A, but it also has a service in B.
const input = {
  profiles: [
    { uuid: 'A', name: 'VPN' },
    { uuid: 'B', name: 'Site' },
  ],
  profileProjects: [
    { projectUuid: 'pv', profileUuid: 'A' },
    { projectUuid: 'ps', profileUuid: 'B' },
  ],
  allProjectUuids: ['pv', 'ps', 'po'],
  services: [
    { accountUuid: 'hz', projectUuid: 'pv' },
    { accountUuid: 'hz', projectUuid: 'ps' },
    { accountUuid: 'aeza', projectUuid: 'pv' },
    { accountUuid: 'ovh', projectUuid: 'ps' },
    { accountUuid: 'loose', projectUuid: 'po' },
  ],
  accountDefaults: [{ accountUuid: 'hz', projectUuid: 'pv' }],
};

test('a profile sees only its projects and accounts', () => {
  const a = computeScope(input, 'A');
  assert.deepEqual(a.projectUuids, ['pv']);
  assert.deepEqual([...a.accountUuids].sort(), ['aeza', 'hz']);
  const b = computeScope(input, 'B');
  assert.deepEqual([...b.accountUuids].sort(), ['hz', 'ovh']);
});

test('a shared account is visible in both, counted only in its home profile', () => {
  assert.equal(homeProfileOf('hz', input), 'A');
  const a = computeScope(input, 'A');
  const b = computeScope(input, 'B');
  assert.ok(a.homeAccountUuids.includes('hz'));
  assert.ok(!b.homeAccountUuids.includes('hz'));
  assert.deepEqual(b.foreignAccountUuids, ['hz']);
  assert.ok(!notificationScope(b).accountUuids.includes('hz'));
});

test('without a default project the account is at home where it has most services', () => {
  const i = {
    ...input,
    accountDefaults: [],
    services: [
      { accountUuid: 'x', projectUuid: 'pv' },
      { accountUuid: 'x', projectUuid: 'ps' },
      { accountUuid: 'x', projectUuid: 'ps' },
    ],
  };
  assert.equal(homeProfileOf('x', i), 'B');
  // A tie goes to the earlier profile.
  const tie = { ...i, services: i.services.slice(0, 2) };
  assert.equal(homeProfileOf('x', tie), 'A');
});

test('projects of no profile form their own bucket', () => {
  const o = computeScope(input, null);
  assert.deepEqual(o.projectUuids, ['po']);
  assert.deepEqual(o.accountUuids, ['loose']);
  assert.deepEqual(o.homeAccountUuids, ['loose']);
});

test('scopeWhere narrows the scoped models only', () => {
  const a = computeScope(input, 'A');
  assert.deepEqual(scopeWhere('Service', a), { projectUuid: { in: ['pv'] } });
  assert.equal(scopeWhere('Settings', a), null);
  assert.equal(scopeWhere('Payment', a).OR.length, 2);
});

test('postFilter drops foreign rows from nested lists', () => {
  const a = computeScope(input, 'A');
  const provider = {
    uuid: 'p1',
    accounts: [
      { uuid: 'aeza', services: [{ uuid: 's1', projectUuid: 'pv' }] },
      { uuid: 'ovh', services: [] },
      {
        uuid: 'hz',
        services: [
          { uuid: 's2', projectUuid: 'pv' },
          { uuid: 's3', projectUuid: 'ps' },
        ],
      },
    ],
  };
  const out = postFilter(provider, a);
  assert.deepEqual(
    out.accounts.map((x) => x.uuid),
    ['aeza', 'hz'],
  );
  assert.deepEqual(
    out.accounts[1].services.map((x) => x.uuid),
    ['s2'],
  );
  assert.ok(!JSON.stringify(out).includes('ovh') && !JSON.stringify(out).includes('s3'));
});
