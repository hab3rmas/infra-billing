import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { APIPL, INT, MADKID, STEAL, snapshot } from './remnawave-fixtures.mjs';

const require = createRequire(import.meta.url);
const { buildTopologyFromRemnawave, hostOf } = require('../dist/remnawave/remnawave.importer.js');

const k = (...p) => `rw:${INT}:${p.join(':')}`;
const run = (mutate) => {
  const s = snapshot();
  mutate?.(s);
  return buildTopologyFromRemnawave(s);
};
const node = (r, key) => r.nodes.find((n) => n.key === key);
const linksBetween = (r, from, to) => r.links.filter((l) => l.fromKey === from && l.toKey === to);

test('hostOf strips scheme, port, path and brackets', () => {
  assert.equal(hostOf('https://Sub.Example.com:8443/path?x=1'), 'sub.example.com');
  assert.equal(hostOf('[2001:db8::1]:443'), '2001:db8::1');
  assert.equal(hostOf('madkid.zxcnub.xyz'), 'madkid.zxcnub.xyz');
  assert.equal(hostOf('203.0.113.10:22'), '203.0.113.10');
});

test('one node per Remnawave node, roles from the outbound graph', () => {
  const r = run();
  assert.equal(node(r, k('node', MADKID)).role, 'bridge');
  assert.equal(node(r, k('node', APIPL)).role, 'exit');
  assert.equal(node(r, k('node', STEAL)).role, 'exit');
  assert.equal(node(r, k('node', MADKID)).kind, 'remnawave');
  assert.equal(node(r, k('node', MADKID)).meta.online, true);
  assert.equal(node(r, k('node', STEAL)).meta.online, false);
});

test('madkid -> api-pl is a bridge link labelled PL-OUT, route 2, with protocol', () => {
  const r = run();
  const [l] = linksBetween(r, k('node', MADKID), k('node', APIPL));
  assert.equal(l.kind, 'bridge');
  assert.equal(l.label, 'PL-OUT');
  assert.equal(l.route, 2);
  assert.equal(l.protocol, 'vless-reality');
  assert.deepEqual(l.meta.inbounds, ['RU-BRIDGE']);
});

test('the bridge DIRECT outbound is a dashed direct link to RU sites for route 1', () => {
  const r = run();
  const links = linksBetween(r, k('node', MADKID), k('ext', 'ru-sites'));
  assert.equal(links.length, 1, 'geo rules fold into the routed link, no duplicate edge');
  assert.equal(links[0].kind, 'direct');
  assert.equal(links[0].route, 1);
  assert.ok(links[0].meta.match.includes('geosite:category-ru'));
  assert.equal(node(r, k('ext', 'ru-sites')).label, 'RU сайты');
});

test('api-pl with two IPs becomes a group: A (listen) -> B (sendThrough) -> Internet', () => {
  const r = run();
  const group = node(r, k('grp', APIPL));
  const a = node(r, k('node', APIPL));
  const b = node(r, k('node', APIPL, 'out'));
  assert.equal(group.kind, 'group');
  assert.equal(a.parentKey, group.key);
  assert.equal(b.parentKey, group.key);
  assert.deepEqual(
    a.addresses.map((x) => [x.value, x.direction]),
    [['203.0.113.10', 'in']],
  );
  assert.deepEqual(
    b.addresses.map((x) => [x.value, x.direction]),
    [['203.0.113.11', 'out']],
  );
  assert.equal(linksBetween(r, a.key, b.key).length, 1, 'internal A -> B link');
  // Inbound links land on A, outbound links start at B.
  assert.equal(linksBetween(r, k('node', MADKID), a.key).length, 1);
  const exit = linksBetween(r, b.key, k('ext', 'internet'));
  assert.equal(exit.length, 1);
  assert.equal(exit[0].kind, 'exit');
});

test('Steal node: wireguard to engage.cloudflareclient.com is a warp link to one shared WARP node', () => {
  const r = run();
  const [l] = linksBetween(r, k('node', STEAL), k('ext', 'warp'));
  assert.equal(l.kind, 'warp');
  assert.equal(l.label, 'warp-out');
  assert.deepEqual(l.meta.match, ['geosite:netflix']);
  assert.equal(r.nodes.filter((n) => n.key === k('ext', 'warp')).length, 1);
});

test('hosts give Clients -> node entry links per route; disabled hosts are skipped', () => {
  const r = run();
  const entries = linksBetween(r, k('ext', 'clients'), k('node', MADKID));
  assert.deepEqual(entries.map((l) => l.route).sort(), [1, 2]);
  assert.ok(entries.every((l) => l.kind === 'entry'));
  assert.equal(linksBetween(r, k('ext', 'clients'), k('node', STEAL)).length, 0);
});

test('panel and subscription page: dashed management links, no animation', () => {
  const r = run();
  const panel = node(r, k('panel'));
  assert.equal(panel.role, 'panel');
  assert.deepEqual(
    panel.addresses.map((a) => a.value),
    ['panel.zxcnub.xyz'],
  );
  for (const n of [MADKID, APIPL, STEAL]) {
    const [l] = linksBetween(r, panel.key, n === APIPL ? k('node', APIPL) : k('node', n));
    assert.equal(l.kind, 'panel');
    assert.equal(l.animated, false);
    assert.equal(l.label, '2222');
  }
  const sub = node(r, k('sub'));
  assert.equal(sub.role, 'subscription');
  assert.equal(linksBetween(r, sub.key, panel.key)[0].kind, 'api');
  assert.equal(linksBetween(r, k('ext', 'clients'), sub.key)[0].kind, 'subscription');
});

test('no subscription URL means no sub page node', () => {
  const r = run((s) => {
    s.subscriptionUrl = null;
  });
  assert.equal(node(r, k('sub')), undefined);
});

test('panel and sub page carry their billing services', () => {
  const r = run((s) => {
    s.panelServiceUuid = 'eeeeeeee-0000-4000-8000-000000000001';
  });
  assert.equal(node(r, k('panel')).serviceUuid, 'eeeeeeee-0000-4000-8000-000000000001');
  assert.equal(node(r, k('panel')).kind, 'service');
});

test('an outbound to an unknown address makes an external node and a warning', () => {
  const r = run((s) => {
    s.profiles[2].config.outbounds.push({
      tag: 'X',
      protocol: 'vless',
      settings: { vnext: [{ address: 'unknown.example.org' }] },
    });
  });
  assert.ok(r.warnings.some((w) => w.includes('unknown.example.org')));
  assert.ok(node(r, k('ext', 'addr:unknown.example.org')));
});

test('output is deterministic and keys are unique', () => {
  const a = run();
  const b = run();
  assert.deepEqual(a, b);
  assert.equal(new Set(a.nodes.map((n) => n.key)).size, a.nodes.length);
  assert.equal(new Set(a.links.map((l) => l.sourceKey)).size, a.links.length);
});

test('a second integration gets different keys, so two panels never overwrite each other', () => {
  const other = buildTopologyFromRemnawave({
    ...snapshot(),
    integrationUuid: '22222222-2222-4222-8222-222222222222',
  });
  const mine = run();
  const keys = new Set([...mine.nodes.map((n) => n.key), ...mine.links.map((l) => l.sourceKey)]);
  for (const key of [...other.nodes.map((n) => n.key), ...other.links.map((l) => l.sourceKey)]) {
    assert.ok(!keys.has(key), `key clash: ${key}`);
  }
});

test('broken or missing configs warn instead of throwing', () => {
  const r = run((s) => {
    s.profiles[0].config = null;
    s.nodes[1].configProfileUuid = 'ffffffff-0000-4000-8000-000000000000';
  });
  assert.ok(r.warnings.length >= 1);
  assert.ok(node(r, k('node', MADKID)));
});
