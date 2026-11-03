import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  extractServiceIps,
  resolveSshHost,
  pickServicesToMove,
} = require('../dist/topology/topology.utils.js');

test('extractServiceIps reads every shape connectors use', () => {
  assert.deepEqual(extractServiceIps({ ip: '1.2.3.4' }), ['1.2.3.4']);
  assert.deepEqual(extractServiceIps({ mainIp: '1.2.3.4', main_ip: '1.2.3.4' }), ['1.2.3.4']);
  assert.deepEqual(extractServiceIps({ IP: '5.6.7.8' }), ['5.6.7.8']);
  assert.deepEqual(extractServiceIps({ ipv4: ['1.1.1.1', '2.2.2.2'] }), ['1.1.1.1', '2.2.2.2']);
  assert.deepEqual(extractServiceIps({ ips: [{ ip: '3.3.3.3' }, '4.4.4.4'] }), [
    '3.3.3.3',
    '4.4.4.4',
  ]);
  assert.deepEqual(extractServiceIps({ ip: '2001:db8::1' }), ['2001:db8::1']);
});

test('extractServiceIps ignores junk and de-duplicates', () => {
  assert.deepEqual(extractServiceIps(null), []);
  assert.deepEqual(extractServiceIps('1.2.3.4'), []);
  assert.deepEqual(extractServiceIps({ ip: 'not-an-ip', ipv4: [1, null, ''] }), []);
  assert.deepEqual(extractServiceIps({ ip: '1.2.3.4', ipv4: ['1.2.3.4'] }), ['1.2.3.4']);
});

test('resolveSshHost falls back in the documented order', () => {
  const node = (sshHost, addresses = []) => ({ sshHost, addresses });
  assert.equal(resolveSshHost(node('h.example'), ['1.1.1.1'], 'rw.example'), 'h.example');
  assert.equal(
    resolveSshHost(
      node(null, [
        { value: '9.9.9.9', direction: 'out' },
        { value: '8.8.8.8', direction: 'in' },
      ]),
      ['1.1.1.1'],
    ),
    '8.8.8.8',
  );
  assert.equal(resolveSshHost(node(null), ['1.1.1.1'], 'rw.example'), '1.1.1.1');
  assert.equal(resolveSshHost(node(null), [], 'rw.example'), 'rw.example');
  assert.equal(resolveSshHost(node(null), []), null);
});

const DEFAULT = 'default';
const t0 = new Date('2026-01-01T00:00:00Z');
const later = new Date('2026-02-01T00:00:00Z');
const earlier = new Date('2025-12-01T00:00:00Z');
const mappings = [
  { accountUuid: 'a-vpn', projectUuid: 'p-vpn', createdAt: t0 },
  { accountUuid: 'a-work', projectUuid: 'p-work', createdAt: t0 },
];
const svc = (uuid, accountUuid, projectUuid = DEFAULT, createdAt = later) => ({
  uuid,
  accountUuid,
  projectUuid,
  createdAt,
});

test('reconciler moves new default-project services to their account project', () => {
  const out = pickServicesToMove(
    [svc('s1', 'a-vpn'), svc('s2', 'a-work'), svc('s3', 'a-other')],
    mappings,
    new Set(),
    DEFAULT,
  );
  assert.deepEqual(out, [
    { serviceUuid: 's1', projectUuid: 'p-vpn' },
    { serviceUuid: 's2', projectUuid: 'p-work' },
  ]);
});

test('reconciler never moves a service twice (manual move back wins)', () => {
  const out = pickServicesToMove([svc('s1', 'a-vpn')], mappings, new Set(['s1']), DEFAULT);
  assert.deepEqual(out, []);
});

test('reconciler leaves services the owner already put in a project', () => {
  const out = pickServicesToMove([svc('s1', 'a-vpn', 'p-manual')], mappings, new Set(), DEFAULT);
  assert.deepEqual(out, []);
});

test('reconciler skips services older than the mapping, unless applying once', () => {
  const old = svc('s1', 'a-vpn', DEFAULT, earlier);
  assert.deepEqual(pickServicesToMove([old], mappings, new Set(), DEFAULT), []);
  assert.deepEqual(
    pickServicesToMove([old], mappings, new Set(), DEFAULT, { ignoreCreatedAt: true }),
    [{ serviceUuid: 's1', projectUuid: 'p-vpn' }],
  );
});

test('two accounts of one hoster land in their own projects', () => {
  const out = pickServicesToMove(
    [svc('s1', 'a-vpn'), svc('s2', 'a-work')],
    mappings,
    new Set(),
    DEFAULT,
  );
  assert.equal(out.find((m) => m.serviceUuid === 's1').projectUuid, 'p-vpn');
  assert.equal(out.find((m) => m.serviceUuid === 's2').projectUuid, 'p-work');
});
