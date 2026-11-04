import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const { buildTabbyYaml, uniqueNames, yamlString } = require('../dist/topology/tabby.js');

// The frontend module is plain TypeScript with no imports: bundle it with esbuild (shipped with
// Vite) into CommonJS for the test.
const esbuild = require('esbuild');
const built = esbuild.buildSync({
  entryPoints: [path.join(here, '../../frontend/src/lib/tabby.ts')],
  bundle: true,
  format: 'cjs',
  write: false,
});
const mod = { exports: {} };
new Function('module', 'exports', built.outputFiles[0].text)(mod, mod.exports);
const { tabbyProfileUrl, tabbyQuickConnectUrl, sshCommand, resolveTabbyTarget } = mod.exports;

test('profile deep link encodes the name', () => {
  assert.equal(tabbyProfileUrl('madkid'), 'tabby://profile?profileName=madkid');
  assert.equal(
    tabbyProfileUrl('RU мост & co/1'),
    'tabby://profile?profileName=RU+%D0%BC%D0%BE%D1%81%D1%82+%26+co%2F1',
  );
});

test('quickConnect link has the ssh provider and user@host:port', () => {
  const url = tabbyQuickConnectUrl({ user: 'root', host: '203.0.113.10', port: 22 });
  assert.equal(url, 'tabby://quickConnect?providerId=ssh&query=root%40203.0.113.10%3A22');
  const q = new URL(url).searchParams;
  assert.equal(q.get('query'), 'root@203.0.113.10:22');
});

test('IPv6 hosts are bracketed', () => {
  const url = tabbyQuickConnectUrl({ user: 'root', host: '2001:db8::1', port: 2222 });
  assert.equal(new URL(url).searchParams.get('query'), 'root@[2001:db8::1]:2222');
});

test('only profile and quickConnect commands are ever produced', () => {
  const urls = [
    tabbyProfileUrl('x'),
    tabbyQuickConnectUrl({ user: 'u', host: 'h', port: 1 }),
    tabbyProfileUrl('run?command=rm -rf /'),
  ];
  for (const u of urls) assert.match(u, /^tabby:\/\/(profile|quickConnect)\?/);
  // A hostile profile name stays inside one query value.
  assert.equal(new URL(urls[2]).searchParams.get('profileName'), 'run?command=rm -rf /');
  assert.equal(new URL(urls[2]).host, 'profile');
});

test('ssh command always spells out the port', () => {
  assert.equal(
    sshCommand({ user: 'root', host: 'h.example', port: 22 }),
    'ssh -p 22 root@h.example',
  );
});

const defaults = { defaultSshUser: 'root', defaultSshPort: 22 };
const node = (over = {}) => ({
  sshHost: null,
  sshPort: null,
  sshUser: null,
  tabbyProfile: null,
  addresses: [],
  service: null,
  ...over,
});

test('target resolution: profile beats quickConnect, defaults fill the gaps', () => {
  assert.equal(resolveTabbyTarget(node(), defaults), null);
  const qc = resolveTabbyTarget(node({ sshHost: 'h.example' }), defaults);
  assert.match(qc.url, /^tabby:\/\/quickConnect/);
  assert.equal(qc.ssh, 'ssh -p 22 root@h.example');
  const prof = resolveTabbyTarget(node({ sshHost: 'h.example', tabbyProfile: 'madkid' }), defaults);
  assert.equal(prof.url, 'tabby://profile?profileName=madkid');
});

test('target resolution order: sshHost, inbound address, service ip, remnawave address', () => {
  const inbound = [
    { value: '9.9.9.9', direction: 'out' },
    { value: '8.8.8.8', direction: 'in' },
  ];
  const svc = { ipCandidates: ['1.1.1.1'] };
  assert.equal(
    resolveTabbyTarget(node({ sshHost: 'x', addresses: inbound, service: svc }), defaults).target
      .host,
    'x',
  );
  assert.equal(
    resolveTabbyTarget(node({ addresses: inbound, service: svc }), defaults).target.host,
    '8.8.8.8',
  );
  assert.equal(resolveTabbyTarget(node({ service: svc }), defaults).target.host, '1.1.1.1');
  assert.equal(
    resolveTabbyTarget(
      node({ meta: { address: 'rw.example' }, sshPort: 2222, sshUser: 'ops' }),
      defaults,
    ).ssh,
    'ssh -p 2222 ops@rw.example',
  );
});

test('yaml export has no secrets and quotes hostile names safely', () => {
  const yaml = buildTabbyYaml([
    {
      uuid: 'u1',
      name: 'madkid',
      group: 'Infra Billing / RU',
      host: '203.0.113.10',
      port: 22,
      user: 'root',
    },
    {
      uuid: 'u2',
      name: 'evil: "x"\n- type: local',
      group: 'g',
      host: '2001:db8::1',
      port: 22,
      user: 'root',
    },
  ]);
  assert.match(yaml, /^profiles:$/m);
  assert.match(yaml, /type: ssh/);
  assert.match(yaml, /host: "203.0.113.10"/);
  assert.ok(!/password|privateKeys|auth/i.test(yaml.replace(/^#.*$/gm, '')));
  // The hostile name is one quoted scalar, not extra YAML structure.
  assert.equal(yamlString('a"b'), '"a\\"b"');
  assert.ok(!yaml.split('\n').some((l) => l.startsWith('- type: local')));
});

test('duplicate profile names get a suffix', () => {
  const m = uniqueNames([
    { uuid: 'a', name: 'madkid' },
    { uuid: 'b', name: 'madkid' },
    { uuid: 'c', name: 'other' },
  ]);
  assert.equal(m.get('a'), 'madkid');
  assert.equal(m.get('b'), 'madkid (2)');
  assert.equal(m.get('c'), 'other');
});

// ---- folders and flags ---------------------------------------------------------------------

const { layoutTabby, renderTabbyYaml } = require('../dist/topology/tabby-config.js');
const { FLAG_SVG, flagIcon, DEFAULT_ICON } = require('../dist/topology/tabby-flags.js');
const jsYaml = require('js-yaml');

const item = (o) => ({
  uuid: o.name,
  role: 'exit',
  country: null,
  host: `${o.name}.example`,
  port: 22,
  user: null,
  bridgeUuid: null,
  rootName: 'Drakosha',
  ...o,
});

test('layout: infra at the root, exits in Nodes, exits behind a bridge in <bridge>-Bridge', () => {
  const { groups, profiles } = layoutTabby([
    item({ name: 'panel', role: 'panel' }),
    item({ name: 'Finland', role: 'bridge', country: 'FI' }),
    item({ name: 'Germany', bridgeUuid: 'Finland', country: 'DE' }),
    item({ name: 'Spain', country: 'ES' }),
  ]);
  const byName = Object.fromEntries(groups.map((g) => [g.name, g]));
  assert.deepEqual(Object.keys(byName).sort(), ['Drakosha', 'Finland-Bridge', 'Nodes']);
  assert.equal(byName.Nodes.parentGroupId, byName.Drakosha.id);
  assert.equal(byName['Finland-Bridge'].parentGroupId, byName.Nodes.id);
  const groupOf = Object.fromEntries(profiles.map((p) => [p.name, p.group]));
  assert.equal(groupOf.panel, byName.Drakosha.id);
  assert.equal(groupOf.Finland, byName['Finland-Bridge'].id);
  assert.equal(groupOf.Germany, byName['Finland-Bridge'].id);
  assert.equal(groupOf.Spain, byName.Nodes.id);
});

test('layout is stable: the same input gives the same ids', () => {
  const items = [item({ name: 'a' })];
  assert.deepEqual(layoutTabby(items), layoutTabby(items));
});

test('flags: a known country gets an SVG, an unknown one the generic icon', () => {
  assert.ok(flagIcon('de').startsWith('<svg'));
  assert.equal(flagIcon('ZZ'), DEFAULT_ICON);
  assert.equal(flagIcon(null), DEFAULT_ICON);
  for (const svg of Object.values(FLAG_SVG)) assert.ok(svg.endsWith('</svg>'));
});

test('rendered YAML parses back, carries no secrets and keeps nesting', () => {
  const doc = jsYaml.load(
    renderTabbyYaml(
      layoutTabby([
        item({ name: 'Finland', role: 'bridge', country: 'FI', port: 2222, user: 'root' }),
        item({ name: 'Germany', bridgeUuid: 'Finland', country: 'DE' }),
      ]),
    ),
  );
  assert.equal(doc.profiles.length, 2);
  const fin = doc.profiles.find((p) => p.name === 'Finland');
  assert.equal(fin.options.port, 2222);
  assert.equal(fin.options.user, 'root');
  assert.ok(fin.icon.startsWith('<svg'));
  assert.ok(fin.id.startsWith('ssh:custom:Finland:'));
  const ids = new Set(doc.groups.map((g) => g.id));
  for (const g of doc.groups) if (g.parentGroupId) assert.ok(ids.has(g.parentGroupId));
  for (const p of doc.profiles) assert.ok(ids.has(p.group));
  assert.ok(!/password|privateKey|token/i.test(JSON.stringify(doc)));
});
