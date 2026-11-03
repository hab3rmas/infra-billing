import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
// Plain TypeScript with no imports: bundle with esbuild (shipped with Vite) for the test.
const built = require('esbuild').buildSync({
  entryPoints: [path.join(here, '../../frontend/src/pages/topology/logic.ts')],
  bundle: true,
  format: 'cjs',
  write: false,
});
const mod = { exports: {} };
new Function('module', 'exports', built.outputFiles[0].text)(mod, mod.exports);
const { chainOf, routeChain, routeNumbers, checkMap, suggestServices } = mod.exports;

const L = (uuid, fromUuid, toUuid, kind = 'chain', route = null, hidden = false) => ({
  uuid,
  fromUuid,
  toUuid,
  kind,
  route,
  hidden,
});
// clients -> madkid (route 1 and 2); madkid -> ru-sites (route 1); madkid -> plA (route 2);
// plA -> plB; plB -> internet; panel -> madkid (management); steal -> warp -> internet.
const links = [
  L('e1', 'clients', 'madkid', 'entry', 1),
  L('e2', 'clients', 'madkid', 'entry', 2),
  L('d1', 'madkid', 'ru', 'direct', 1),
  L('b2', 'madkid', 'plA', 'bridge', 2),
  L('in', 'plA', 'plB', 'chain'),
  L('x', 'plB', 'net', 'exit'),
  L('p', 'panel', 'madkid', 'panel'),
  L('s1', 'clients', 'steal', 'entry'),
  L('w', 'steal', 'warp', 'warp'),
  L('wx', 'warp', 'net', 'exit'),
];

test('chainOf follows the link direction both ways', () => {
  const c = chainOf('plA', links);
  assert.deepEqual([...c.nodes].sort(), ['clients', 'madkid', 'net', 'panel', 'plA', 'plB']);
  assert.ok(!c.nodes.has('steal'), 'an unrelated chain is not highlighted');
  assert.ok(c.edges.has('b2') && c.edges.has('x') && !c.edges.has('w'));
});

test('route numbers come from traffic links only', () => {
  assert.deepEqual(routeNumbers(links), [1, 2]);
  assert.deepEqual(routeNumbers([L('p', 'a', 'b', 'panel', 7)]), []);
});

test('route 2 goes clients -> madkid -> A -> B -> internet, not to RU sites', () => {
  const r = routeChain(2, links);
  assert.deepEqual([...r.nodes].sort(), ['clients', 'madkid', 'net', 'plA', 'plB']);
  assert.ok(!r.nodes.has('ru') && !r.nodes.has('panel'));
});

test('route 1 is the direct exit and stays out of the Polish chain', () => {
  const r = routeChain(1, links);
  assert.deepEqual([...r.nodes].sort(), ['clients', 'madkid', 'ru']);
});

test('hidden links do not count', () => {
  const r = routeChain(
    2,
    links.map((l) => (l.uuid === 'b2' ? { ...l, hidden: true } : l)),
  );
  assert.ok(!r.nodes.has('plA'));
});

const N = (uuid, over = {}) => ({
  uuid,
  kind: 'external',
  label: uuid,
  serviceUuid: null,
  parentUuid: null,
  hidden: false,
  addresses: [],
  sshHost: null,
  meta: {},
  ...over,
});

test('map check: isolated nodes and cycles', () => {
  const nodes = [N('a'), N('b'), N('c'), N('lonely'), N('g', { kind: 'group' })];
  const p = checkMap(nodes, [L('1', 'a', 'b'), L('2', 'b', 'c'), L('3', 'c', 'a')]);
  assert.deepEqual(p.isolated, ['lonely']);
  assert.equal(p.cycles.length, 1);
  assert.deepEqual(checkMap(nodes, [L('1', 'a', 'b')]).cycles, []);
  // A management link never makes a "cycle".
  assert.deepEqual(checkMap(nodes, [L('1', 'a', 'b'), L('2', 'b', 'a', 'panel')]).cycles, []);
});

test('suggestions: exact IP beats country, taken services are skipped', () => {
  const services = [
    { uuid: 's-pl', name: 'ds-3fe48a', countryCode: 'PL' },
    { uuid: 's-fi', name: 'ds-af1a8c', countryCode: 'FI' },
    { uuid: 's-fi2', name: 'other-fi', countryCode: 'FI' },
  ];
  const targets = [
    { serviceUuid: 's-pl', host: '179.253.101.6' },
    { serviceUuid: 's-fi', host: '65.109.181.209' },
  ];
  const poland = N('pl', {
    addresses: [{ value: '179.253.101.6', direction: 'in' }],
    meta: { countryCode: 'PL' },
  });
  assert.deepEqual(suggestServices(poland, services, targets, new Set()), [
    { serviceUuid: 's-pl', reason: 'ip' },
  ]);
  const finland = N('fi', { meta: { countryCode: 'FI' } });
  const s = suggestServices(finland, services, targets, new Set());
  assert.deepEqual(s.map((x) => x.serviceUuid).sort(), ['s-fi', 's-fi2']);
  assert.ok(s.every((x) => x.reason === 'country'));
  assert.deepEqual(
    suggestServices(finland, services, targets, new Set(['s-fi'])).map((x) => x.serviceUuid),
    ['s-fi2'],
  );
  assert.deepEqual(suggestServices(N('x'), services, targets, new Set()), []);
});
