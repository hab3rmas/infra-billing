// End-to-end check of the Remnawave integration against a running panel and a mock Remnawave API
// (the fixture is the owner's scheme):
//   BASE=http://127.0.0.1:8091 USER_NAME=owner PASSWORD=… node apps/backend/fork-test/remnawave-e2e.mjs
// Covers: connection test, import, idempotent re-sync, manual links and hidden imported links
// surviving a sync, owner overrides, two integrations on different maps and on one map, secrets.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { snapshot } from './remnawave-fixtures.mjs';

const BASE = process.env.BASE ?? 'http://127.0.0.1:8080';
const TOKEN = 'rw-secret-token-123';
let cookie = '';
// WITH_PROFILE=1 runs the whole flow inside a profile (X-Profile), like the UI does.
let profileHeader = {};

async function call(method, path, body, expected) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', cookie, ...profileHeader },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
  const text = await res.text();
  if (expected !== undefined)
    assert.equal(res.status, expected, `${method} ${path} -> ${res.status} ${text}`);
  else assert.ok(res.status < 400, `${method} ${path} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

// ---- mock Remnawave --------------------------------------------------------------------------
const snap = snapshot();
let mock = {
  nodes: snap.nodes.map((n) => ({
    uuid: n.uuid,
    name: n.name,
    address: n.address,
    port: n.port,
    countryCode: n.countryCode,
    isConnected: n.isConnected,
    isDisabled: n.isDisabled,
    configProfile: {
      activeConfigProfileUuid: n.configProfileUuid,
      activeInbounds: n.activeInboundUuids.map((uuid) => ({ uuid })),
    },
  })),
  profiles: snap.profiles,
  hosts: snap.hosts.map((h) => ({
    uuid: h.uuid,
    remark: h.remark,
    address: h.address,
    port: h.port,
    isDisabled: h.isDisabled,
    vlessRoute: h.vlessRoute,
    inbound: { configProfileUuid: h.configProfileUuid, configProfileInboundUuid: h.inboundUuid },
  })),
};
const seen = { auth: [], extra: [] };
const server = createServer((req, res) => {
  seen.auth.push(req.headers.authorization);
  seen.extra.push(req.headers['x-panel-secret']);
  res.setHeader('content-type', 'application/json');
  if (req.headers.authorization !== `Bearer ${TOKEN}`) {
    res.statusCode = 401;
    return res.end('{}');
  }
  if (req.url === '/api/nodes') return res.end(JSON.stringify({ response: mock.nodes }));
  if (req.url === '/api/config-profiles') {
    return res.end(JSON.stringify({ response: { configProfiles: mock.profiles } }));
  }
  if (req.url === '/api/hosts') return res.end(JSON.stringify({ response: mock.hosts }));
  if (req.url === '/api/system/metadata')
    return res.end(JSON.stringify({ response: { version: '2.1.0' } }));
  res.statusCode = 404;
  res.end('{}');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const MOCK_URL = `http://127.0.0.1:${server.address().port}`;

await call('POST', '/auth/login', {
  username: process.env.USER_NAME ?? 'owner',
  password: process.env.PASSWORD ?? 'password123',
});
const step = (n) => console.log(`- ${n}`);
if (process.env.WITH_PROFILE === '1') {
  const prof = await call('POST', '/profiles', { name: `RW profile ${Date.now()}` });
  profileHeader = { 'X-Profile': prof.uuid };
  console.log('running inside a profile');
}
const graph = (map) => call('GET', `/topology/maps/${map}`);
const byLabel = (g, label) => g.nodes.find((n) => n.label === label);

step('URL rules: https only, http for private hosts');
const mapA = await call('POST', '/topology/maps', { name: 'RW A', preset: 'vpn' });
const mapB = await call('POST', '/topology/maps', { name: 'RW B', preset: 'vpn' });
const bad = { name: 'x', mapUuid: mapA.uuid, token: 't' };
await call('POST', '/remnawave/integrations', { ...bad, baseUrl: 'http://panel.example.com' }, 400);
await call('POST', '/remnawave/integrations', { ...bad, baseUrl: 'ftp://panel.example.com' }, 400);
await call(
  'POST',
  '/remnawave/integrations',
  { ...bad, baseUrl: 'https://user:pw@panel.example.com' },
  400,
);

step('create: secrets never come back');
const created = await call('POST', '/remnawave/integrations', {
  name: 'VPN main',
  mapUuid: mapA.uuid,
  baseUrl: MOCK_URL,
  token: TOKEN,
  extraHeaders: { 'X-Panel-Secret': 'cookie-1' },
  subscriptionUrl: 'https://sub.zxcnub.xyz/',
});
assert.equal(created.tokenSet, true);
assert.equal(created.extraHeadersSet, true);
const listText = JSON.stringify(await call('GET', '/remnawave/integrations'));
assert.ok(!listText.includes(TOKEN) && !listText.includes('cookie-1'), 'no secret in the list');
await call(
  'PATCH',
  `/remnawave/integrations/${created.uuid}`,
  { extraHeaders: { 'bad header': 'x' } },
  400,
);

step('test connection');
const t = await call('POST', `/remnawave/integrations/${created.uuid}/test`);
assert.deepEqual([t.ok, t.version, t.nodes], [true, '2.1.0', 3]);
assert.ok(seen.extra.includes('cookie-1'), 'extra headers are sent to the panel');
const wrong = await call('POST', '/remnawave/integrations', {
  name: 'wrong token',
  mapUuid: mapA.uuid,
  baseUrl: MOCK_URL,
  token: 'nope',
});
const tw = await call('POST', `/remnawave/integrations/${wrong.uuid}/test`);
assert.equal(tw.ok, false);
assert.ok(!tw.error.includes('nope'), 'the token is not echoed in errors');
await call('DELETE', `/remnawave/integrations/${wrong.uuid}`, undefined, 204);

step('first sync builds the owner scheme');
const s1 = await call('POST', `/remnawave/integrations/${created.uuid}/sync`);
assert.ok(s1.nodesCreated >= 8 && s1.linksCreated >= 12, JSON.stringify(s1));
let g = await graph(mapA.uuid);
const madkid = byLabel(g, 'madkid');
const plA = g.nodes.find((n) => n.label === 'api-pl · IP A');
const plB = g.nodes.find((n) => n.label === 'api-pl · IP B');
assert.ok(madkid && plA && plB, 'madkid and the two IPs of api-pl');
assert.equal(
  plA.parentUuid,
  g.nodes.find((n) => n.label === 'api-pl').uuid,
  'A and B live in a group',
);
assert.equal(plB.addresses[0].direction, 'out');
const bridge = g.links.find((l) => l.fromUuid === madkid.uuid && l.toUuid === plA.uuid);
assert.deepEqual([bridge.kind, bridge.label, bridge.route], ['bridge', 'PL-OUT', 2]);
assert.ok(
  g.links.some((l) => l.kind === 'direct' && l.route === 1),
  'route 1 direct exit',
);
assert.ok(
  g.links.some((l) => l.kind === 'warp'),
  'WARP',
);
assert.ok(g.links.every((l) => l.source === 'remnawave'));

step('re-sync changes nothing and duplicates nothing');
const before = { n: g.nodes.length, l: g.links.length };
const s2 = await call('POST', `/remnawave/integrations/${created.uuid}/sync`);
assert.deepEqual(
  [
    s2.nodesCreated,
    s2.nodesUpdated,
    s2.nodesHidden,
    s2.linksCreated,
    s2.linksUpdated,
    s2.linksRemoved,
  ],
  [0, 0, 0, 0, 0, 0],
  JSON.stringify(s2),
);
g = await graph(mapA.uuid);
assert.deepEqual({ n: g.nodes.length, l: g.links.length }, before);

step('a manual link survives, a hidden imported link stays hidden, owner edits stick');
const clients = byLabel(g, 'Клиенты');
const manual = await call('POST', '/topology/links', {
  mapUuid: mapA.uuid,
  fromUuid: clients.uuid,
  toUuid: madkid.uuid,
  kind: 'custom',
  label: 'mine',
});
const hiddenLink = g.links.find((l) => l.kind === 'warp');
await call('DELETE', `/topology/links/${hiddenLink.uuid}`, undefined, 204); // imported: hidden, not deleted
const relabel = g.links.find((l) => l.label === 'PL-OUT');
await call('PATCH', `/topology/links/${relabel.uuid}`, { label: 'MY-LABEL', animated: false });
await call('PATCH', `/topology/nodes/${madkid.uuid}`, { label: 'madkid-ru', role: 'relay' });
await call('POST', `/remnawave/integrations/${created.uuid}/sync`);
g = await graph(mapA.uuid);
assert.ok(
  g.links.some((l) => l.uuid === manual.uuid),
  'manual link survived',
);
assert.equal(g.links.find((l) => l.uuid === hiddenLink.uuid).hidden, true, 'hidden stays hidden');
const kept = g.links.find((l) => l.uuid === relabel.uuid);
assert.deepEqual(
  [kept.label, kept.animated],
  ['MY-LABEL', false],
  'owner label and animation kept',
);
const keptNode = g.nodes.find((n) => n.uuid === madkid.uuid);
assert.deepEqual(
  [keptNode.label, keptNode.role],
  ['madkid-ru', 'relay'],
  'owner label and role kept',
);
assert.equal(
  g.nodes.filter((n) => n.label === 'madkid').length,
  0,
  'no duplicate of the renamed node',
);

step('panel changes flow in: a removed outbound removes its link, a gone node is hidden');
mock.profiles = JSON.parse(JSON.stringify(mock.profiles));
mock.profiles[2].config.outbounds = mock.profiles[2].config.outbounds.filter(
  (o) => o.tag !== 'warp-out',
);
mock.nodes = mock.nodes.filter((n) => n.name !== 'steal-sg');
const s3 = await call('POST', `/remnawave/integrations/${created.uuid}/sync`);
assert.ok(s3.linksRemoved >= 1 && s3.nodesHidden >= 1, JSON.stringify(s3));
g = await graph(mapA.uuid);
assert.equal(g.nodes.find((n) => n.label === 'steal-sg').hidden, true);
assert.ok(
  g.links.some((l) => l.uuid === manual.uuid),
  'manual link still there',
);
mock = { ...mock, nodes: mock.nodes }; // keep the reduced panel for the next checks

step('two integrations: different maps are independent, one map keeps both sets');
const second = await call('POST', '/remnawave/integrations', {
  name: 'Test panel',
  mapUuid: mapB.uuid,
  baseUrl: MOCK_URL,
  token: TOKEN,
});
await call('POST', `/remnawave/integrations/${second.uuid}/sync`);
const gB = await graph(mapB.uuid);
assert.ok(gB.nodes.length > 0);
const gA2 = await graph(mapA.uuid);
assert.equal(gA2.nodes.length, g.nodes.length, 'map A untouched by the sync of map B');
const third = await call('POST', '/remnawave/integrations', {
  name: 'Second on A',
  mapUuid: mapA.uuid,
  baseUrl: MOCK_URL,
  token: TOKEN,
});
await call('POST', `/remnawave/integrations/${third.uuid}/sync`);
const gA3 = await graph(mapA.uuid);
assert.ok(gA3.links.length > gA2.links.length, 'a second panel adds its own links');
assert.ok(gA3.links.some((l) => l.uuid === manual.uuid));
await call('POST', `/remnawave/integrations/${third.uuid}/sync`);
assert.equal((await graph(mapA.uuid)).links.length, gA3.links.length, 'and is idempotent too');

step('reveal works for the owner session only; delete keeps or purges');
const rev = await call('POST', `/remnawave/integrations/${created.uuid}/credentials/reveal`);
assert.equal(rev.token, TOKEN);
await call('DELETE', `/remnawave/integrations/${third.uuid}?purge=true`, undefined, 204);
const gA4 = await graph(mapA.uuid);
assert.ok(gA4.links.some((l) => l.uuid === manual.uuid));
await call('DELETE', `/remnawave/integrations/${created.uuid}`, undefined, 204);
const gA5 = await graph(mapA.uuid);
assert.ok(
  gA5.links.every((l) => l.source === 'manual'),
  'links became manual after detaching',
);

server.close();
console.log('remnawave e2e: OK');
