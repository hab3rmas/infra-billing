// API checks for the review / import / country / profile-delete additions:
//   BASE=http://127.0.0.1:8091 USER_NAME=owner PASSWORD=… node apps/backend/fork-test/stage6-api.mjs
import assert from 'node:assert/strict';

const BASE = process.env.BASE ?? 'http://127.0.0.1:8080';
let cookie = '';
async function call(method, path, body, expected) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', cookie },
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
const step = (n) => console.log(`- ${n}`);
await call('POST', '/auth/login', {
  username: process.env.USER_NAME ?? 'owner',
  password: process.env.PASSWORD ?? 'password123',
});
const RUN = Date.now().toString(36);

step('a hand-set country lives apart from the importer country');
const map = await call('POST', '/topology/maps', { name: `s6-${RUN}`, preset: 'vpn' });
const node = await call('POST', '/topology/nodes', {
  mapUuid: map.uuid,
  kind: 'external',
  role: 'bot',
  label: 'x',
});
const set = await call('PATCH', `/topology/nodes/${node.uuid}`, { countryCode: 'FI' });
assert.equal(set.meta.countryManual, 'FI');
const cleared = await call('PATCH', `/topology/nodes/${node.uuid}`, { countryCode: null });
assert.equal(cleared.meta.countryManual, undefined);
await call('PATCH', `/topology/nodes/${node.uuid}`, { countryCode: 'finland' }, 400);

step('export document -> import creates an equal, independent map');
const a = await call('POST', '/topology/nodes', {
  mapUuid: map.uuid,
  kind: 'external',
  role: 'client',
  label: 'Клиенты',
  posX: 10,
  posY: 20,
});
const g1 = await call('POST', '/topology/nodes', {
  mapUuid: map.uuid,
  kind: 'group',
  label: 'grp',
});
const b = await call('POST', '/topology/nodes', {
  mapUuid: map.uuid,
  kind: 'external',
  role: 'exit',
  label: 'in-group',
  parentUuid: g1.uuid,
});
await call('POST', '/topology/links', {
  mapUuid: map.uuid,
  fromUuid: a.uuid,
  toUuid: b.uuid,
  kind: 'entry',
  route: 2,
  label: 'PL',
});
const g = await call('GET', `/topology/maps/${map.uuid}`);
const doc = {
  version: 1,
  name: `${map.name}-copy`,
  preset: g.map.preset,
  nodes: g.nodes.map((n) => ({
    id: n.uuid,
    kind: n.kind,
    role: n.role,
    label: n.label,
    serviceUuid: n.serviceUuid,
    parentId: n.parentUuid,
    addresses: n.addresses,
    posX: n.posX,
    posY: n.posY,
    hidden: n.hidden,
    sshHost: n.sshHost,
    sshPort: n.sshPort,
    sshUser: n.sshUser,
    tabbyProfile: n.tabbyProfile,
    countryCode: null,
  })),
  links: g.links.map((l) => ({
    from: l.fromUuid,
    to: l.toUuid,
    kind: l.kind,
    label: l.label,
    route: l.route,
    protocol: l.protocol,
    animated: l.animated,
    hidden: l.hidden,
  })),
};
const copy = await call('POST', '/topology/maps/import', doc);
const gc = await call('GET', `/topology/maps/${copy.uuid}`);
assert.equal(gc.nodes.length, g.nodes.length);
assert.equal(gc.links.length, 1);
assert.equal(gc.links[0].route, 2);
assert.ok(
  gc.nodes.every((n) => !g.nodes.some((o) => o.uuid === n.uuid)),
  'new uuids',
);
const inGroup = gc.nodes.find((n) => n.label === 'in-group');
assert.equal(
  gc.nodes.find((n) => n.uuid === inGroup.parentUuid).label,
  'grp',
  'group nesting survives',
);
assert.equal(gc.nodes.find((n) => n.label === 'Клиенты').posX, 10);

step('a bad document is rejected');
await call(
  'POST',
  '/topology/maps/import',
  { ...doc, links: [{ ...doc.links[0], to: 'nope' }] },
  400,
);
await call('POST', '/topology/maps/import', { ...doc, nodes: [...doc.nodes, doc.nodes[0]] }, 400);
await call('POST', '/topology/maps/import', { ...doc, version: 2 }, 400);
// a service that no longer exists is dropped, not an error
const withGhost = {
  ...doc,
  name: `ghost-${RUN}`,
  nodes: doc.nodes.map((n, i) =>
    i === 0 ? { ...n, serviceUuid: '00000000-0000-4000-8000-000000000009' } : n,
  ),
};
const ghost = await call('POST', '/topology/maps/import', withGhost);
assert.ok(
  (await call('GET', `/topology/maps/${ghost.uuid}`)).nodes.every((n) => n.serviceUuid === null),
);

step('deleting a profile can hand its maps over');
const pA = await call('POST', '/profiles', { name: `S6 A ${RUN}` });
const pB = await call('POST', '/profiles', { name: `S6 B ${RUN}` });
const mapInA = await fetch(`${BASE}/api/topology/maps`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie, 'X-Profile': pA.uuid },
  body: JSON.stringify({ name: `inA-${RUN}`, preset: 'web' }),
}).then((r) => r.json());
assert.equal(mapInA.profileUuid, pA.uuid);
await call('DELETE', `/profiles/${pA.uuid}?moveMapsTo=${pA.uuid}`, undefined, 400);
await call('DELETE', `/profiles/${pA.uuid}?moveMapsTo=${pB.uuid}`, undefined, 204);
const moved = (await call('GET', '/topology/maps')).find((m) => m.uuid === mapInA.uuid);
assert.equal(moved.profileUuid, pB.uuid);
await call('DELETE', `/profiles/${pB.uuid}`, undefined, 204);
assert.equal(
  (await call('GET', '/topology/maps')).find((m) => m.uuid === mapInA.uuid).profileUuid,
  null,
  'without moveMapsTo the map is left without a profile',
);

step('integrations expose their last warnings (empty list when none)');
const ints = await call('GET', '/remnawave/integrations');
assert.ok(ints.every((i) => Array.isArray(i.lastWarnings)));

console.log('stage 6 api: OK');
