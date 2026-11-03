import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { INT, MADKID, snapshot } from './remnawave-fixtures.mjs';

const require = createRequire(import.meta.url);
const { buildTopologyFromRemnawave } = require('../dist/remnawave/remnawave.importer.js');
const { planImport } = require('../dist/remnawave/remnawave.plan.js');
const { matchService, isUsableIp } = require('../dist/remnawave/remnawave.match.js');
const { checkPanelUrl, isLocalOrPrivateHost } = require('../dist/remnawave/remnawave.url.js');
const {
  parseNodes,
  parseProfileList,
  parseHosts,
  unwrap,
} = require('../dist/remnawave/remnawave.parse.js');

const imported = () => buildTopologyFromRemnawave(snapshot());

// Turn a plan's creates into "existing" rows, as the DB would return them (jsonb reorders keys).
function materialize(plan) {
  let i = 0;
  const idOf = new Map();
  const nodes = plan.nodeCreates.map((c) => {
    const uuid = `n${++i}`;
    idOf.set(c.key, uuid);
    return {
      uuid,
      ...c.data,
      label: c.data.label,
      parentUuid: null,
      hidden: false,
      source: 'remnawave',
      meta: c.data.meta,
      _parentKey: c.parentKey,
    };
  });
  for (const n of nodes) {
    n.parentUuid = n._parentKey ? idOf.get(n._parentKey) : null;
    // jsonb returns keys in another order
    n.meta = Object.fromEntries(Object.entries(n.meta).reverse());
  }
  const links = plan.linkCreates.map(({ link }) => ({
    uuid: `l${++i}`,
    kind: link.kind,
    label: link.label,
    route: link.route,
    protocol: link.protocol,
    source: 'remnawave',
    sourceKey: link.sourceKey,
    meta: Object.fromEntries(Object.entries(link.meta).reverse()),
  }));
  return { nodes, links };
}

const plan = (existing, extra = {}) =>
  planImport({
    integrationUuid: INT,
    existingNodes: existing.nodes,
    existingLinks: existing.links,
    imported: imported(),
    serviceMatches: new Map(),
    ...extra,
  });

test('an empty map gets every node and link created', () => {
  const p = plan({ nodes: [], links: [] });
  const imp = imported();
  assert.equal(p.nodeCreates.length, imp.nodes.length);
  assert.equal(p.linkCreates.length, imp.links.length);
  assert.equal(
    p.nodeUpdates.length + p.nodeHides.length + p.linkUpdates.length + p.linkDeletes.length,
    0,
  );
});

test('planning against its own result is a no-op, even with reordered jsonb keys', () => {
  const existing = materialize(plan({ nodes: [], links: [] }));
  const p = plan(existing);
  assert.deepEqual(
    [
      p.nodeCreates.length,
      p.nodeUpdates.length,
      p.nodeHides.length,
      p.linkCreates.length,
      p.linkUpdates.length,
      p.linkDeletes.length,
    ],
    [0, 0, 0, 0, 0, 0],
  );
});

test('owner overrides: label, role, link label are kept; manual links are never planned', () => {
  const existing = materialize(plan({ nodes: [], links: [] }));
  const madkid = existing.nodes.find((n) => n.remnawaveNodeUuid === MADKID);
  madkid.label = 'mine';
  madkid.role = 'relay';
  madkid.meta = { ...madkid.meta, labelOverridden: true, roleOverridden: true };
  const link = existing.links.find((l) => l.label === 'PL-OUT');
  link.label = 'MY';
  link.meta = { ...link.meta, overridden: ['label'] };
  existing.links.push({
    uuid: 'manual',
    kind: 'custom',
    label: 'x',
    route: null,
    protocol: null,
    source: 'manual',
    sourceKey: null,
    meta: {},
  });
  const p = plan(existing);
  assert.equal(p.nodeUpdates.length, 0);
  assert.equal(p.linkUpdates.length, 0);
  assert.equal(p.linkDeletes.length, 0, 'the manual link is not touched');
});

test('without override flags a changed panel value flows in', () => {
  const existing = materialize(plan({ nodes: [], links: [] }));
  existing.nodes.find((n) => n.remnawaveNodeUuid === MADKID).label = 'old name';
  const p = plan(existing);
  assert.equal(p.nodeUpdates.length, 1);
  assert.equal(p.nodeUpdates[0].data.label, 'madkid');
});

test('links and nodes that left the panel: links removed, nodes hidden, hidden ones left alone', () => {
  const existing = materialize(plan({ nodes: [], links: [] }));
  existing.nodes.push({
    uuid: 'gone',
    kind: 'remnawave',
    role: 'exit',
    label: 'old',
    serviceUuid: null,
    parentUuid: null,
    addresses: [],
    hidden: false,
    source: 'remnawave',
    remnawaveNodeUuid: 'zzz',
    meta: { importKey: `rw:${INT}:node:zzz`, integrationUuid: INT },
  });
  existing.nodes.push({
    uuid: 'gone2',
    kind: 'remnawave',
    role: 'exit',
    label: 'old2',
    serviceUuid: null,
    parentUuid: null,
    addresses: [],
    hidden: true,
    source: 'remnawave',
    remnawaveNodeUuid: 'yyy',
    meta: { importKey: `rw:${INT}:node:yyy`, integrationUuid: INT },
  });
  existing.links.push({
    uuid: 'stale',
    kind: 'chain',
    label: 'x',
    route: null,
    protocol: null,
    source: 'remnawave',
    sourceKey: `rw:${INT}:out:gone`,
    meta: {},
  });
  // A link of ANOTHER integration is not ours to delete.
  existing.links.push({
    uuid: 'other',
    kind: 'chain',
    label: 'x',
    route: null,
    protocol: null,
    source: 'remnawave',
    sourceKey: 'rw:22222222-2222-4222-8222-222222222222:out:x',
    meta: {},
  });
  const p = plan(existing);
  assert.deepEqual(p.nodeHides, ['gone']);
  assert.deepEqual(p.linkDeletes, ['stale']);
});

test('service link: matched once, then left alone when the owner changed it', () => {
  const key = `rw:${INT}:node:${MADKID}`;
  const matches = new Map([[key, 'svc-1']]);
  const first = plan({ nodes: [], links: [] }, { serviceMatches: matches });
  assert.equal(first.nodeCreates.find((c) => c.key === key).data.serviceUuid, 'svc-1');

  const existing = materialize(first);
  const madkid = existing.nodes.find((n) => n.remnawaveNodeUuid === MADKID);
  // The owner picked another service by hand.
  madkid.serviceUuid = 'svc-mine';
  madkid.meta = { ...madkid.meta, serviceOverridden: true, serviceAuto: false };
  assert.equal(plan(existing, { serviceMatches: matches }).nodeUpdates.length, 0);
  // The owner removed the link: still left alone.
  madkid.serviceUuid = null;
  assert.equal(plan(existing, { serviceMatches: matches }).nodeUpdates.length, 0);
});

test('a Remnawave node already bound on the map is added without the binding (unique per map)', () => {
  const existing = {
    nodes: [
      {
        uuid: 'x',
        kind: 'remnawave',
        role: 'bridge',
        label: 'madkid',
        serviceUuid: null,
        parentUuid: null,
        addresses: [],
        hidden: false,
        source: 'remnawave',
        remnawaveNodeUuid: MADKID,
        meta: { importKey: 'rw:other:node:x', integrationUuid: 'other' },
      },
    ],
    links: [],
  };
  const p = plan(existing);
  const c = p.nodeCreates.find((n) => n.key === `rw:${INT}:node:${MADKID}`);
  assert.equal(c.data.remnawaveNodeUuid, null);
  assert.ok(p.warnings.length >= 1);
});

test('service matching: IP first, project preferred, ambiguity reported, name as fallback', () => {
  const svcs = [
    { uuid: 'a', name: 'madkid', projectUuid: 'p1', ips: ['1.1.1.1'] },
    { uuid: 'b', name: 'other', projectUuid: 'p2', ips: ['1.1.1.1'] },
    { uuid: 'c', name: 'api-pl', projectUuid: 'p2', ips: ['2.2.2.2'] },
  ];
  assert.deepEqual(matchService({ name: 'x', ips: ['1.1.1.1'] }, svcs, 'p1'), { uuid: 'a' });
  assert.deepEqual(matchService({ name: 'x', ips: ['1.1.1.1'] }, svcs, 'p3').ambiguous.sort(), [
    'madkid',
    'other',
  ]);
  assert.deepEqual(matchService({ name: 'API-PL', ips: [] }, svcs, null), { uuid: 'c' });
  assert.equal(matchService({ name: 'nothing', ips: ['9.9.9.9'] }, svcs, null), null);
});

test('panel URL rules', () => {
  assert.equal(checkPanelUrl('https://panel.example.com/').ok, true);
  assert.equal(checkPanelUrl('http://panel.example.com').ok, false);
  assert.equal(checkPanelUrl('http://localhost:3000').ok, true);
  assert.equal(checkPanelUrl('http://192.168.1.5').ok, true);
  assert.equal(checkPanelUrl('http://172.32.0.1').ok, false);
  assert.equal(checkPanelUrl('https://u:p@x.example.com').ok, false);
  assert.equal(checkPanelUrl('javascript:alert(1)').ok, false);
  assert.equal(isLocalOrPrivateHost('10.0.0.1'), true);
  assert.equal(isLocalOrPrivateHost('8.8.8.8'), false);
});

test('parsers accept wrapped and bare payloads and skip junk without throwing', () => {
  const warns = [];
  const warn = (m) => warns.push(m);
  assert.deepEqual(unwrap({ response: [1] }), [1]);
  const nodes = parseNodes(
    {
      response: [
        {
          uuid: 'a',
          address: 'h',
          name: 'n',
          configProfile: { activeConfigProfileUuid: 'p', activeInbounds: [{ uuid: 'i' }, 'j'] },
        },
        5,
        { name: 'no uuid' },
      ],
    },
    warn,
  );
  assert.equal(nodes.length, 1);
  assert.deepEqual(nodes[0].activeInboundUuids, ['i', 'j']);
  assert.ok(warns.length >= 1);
  assert.equal(
    parseProfileList(
      {
        response: {
          configProfiles: [{ uuid: 'p', name: 'x', inbounds: [{ uuid: 'i', tag: 't' }] }],
        },
      },
      warn,
    )[0].inbounds[0].tag,
    't',
  );
  assert.equal(
    parseHosts(
      { response: [{ uuid: 'h', vlessRoute: '2', inbound: { configProfileInboundUuid: 'i' } }] },
      warn,
    )[0].vlessRoute,
    2,
  );
  assert.deepEqual(parseHosts('garbage', warn), []);
});

test('IPs from the node config match a service even when DNS is useless (fake-IP resolver)', () => {
  const svcs = [{ uuid: 'pl', name: 'ds-3fe48a', projectUuid: 'p1', ips: ['179.253.101.6'] }];
  // The domain resolves to 198.18.x.x (Clash / sing-box fake IP); the inbound listens on the real IP.
  const r = matchService(
    { name: 'Poland', ips: ['198.18.4.34', '127.0.0.1', 'api-pl.zxcnub.xyz', '179.253.101.6'] },
    svcs,
    'p1',
  );
  assert.deepEqual(r, { uuid: 'pl' });
  // Only the fake IP: no (wrong) match.
  assert.equal(matchService({ name: 'x', ips: ['198.18.4.34'] }, svcs, 'p1'), null);
});

test('usable IPs are public IPv4 only', () => {
  for (const ip of ['179.253.101.6', '65.109.181.209', '8.8.8.8'])
    assert.equal(isUsableIp(ip), true, ip);
  for (const ip of [
    '198.18.4.34',
    '198.19.0.1',
    '127.0.0.1',
    '10.1.2.3',
    '192.168.0.5',
    '172.20.0.1',
    '169.254.1.1',
    '100.64.0.1',
    '0.0.0.0',
    '999.1.1.1',
    'example.com',
    '::1',
    '',
  ])
    assert.equal(isUsableIp(ip), false, ip);
});
