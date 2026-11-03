// Smoke test of the stage 1 API against a running panel (not a unit test, hence no .test.mjs):
//   BASE=http://127.0.0.1:8090 node apps/backend/fork-test/smoke-stage1.mjs
// Needs a fresh database (it runs first-run setup).
import assert from 'node:assert/strict';

const BASE = process.env.BASE ?? 'http://127.0.0.1:8080';
const DEFAULT_PROJECT = '00000000-0000-0000-0000-000000000001';
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
  const json = text ? JSON.parse(text) : null;
  if (expected !== undefined) {
    assert.equal(res.status, expected, `${method} ${path} -> ${res.status} ${text}`);
  } else {
    assert.ok(res.status < 400, `${method} ${path} -> ${res.status} ${text}`);
  }
  return json;
}

// There is no GET /services/:uuid, so read it from the list.
const getService = async (uuid) => (await call('GET', '/services')).find((s) => s.uuid === uuid);

const step = (name) => console.log(`- ${name}`);

step('first-run setup + login');
await call('POST', '/auth/setup', { username: 'owner', password: 'password123' });
await call('POST', '/auth/login', { username: 'owner', password: 'password123' });

step('two accounts of one hoster, a service in each (default project)');
const provider = await call('POST', '/providers', {
  name: 'Aeza',
  kind: 'manual',
  account: { label: 'VPN' },
});
const work = await call('POST', `/providers/${provider.uuid}/accounts`, { label: 'Work' });
const accVpn =
  provider.accounts?.[0]?.uuid ??
  (await call('GET', `/providers/${provider.uuid}`)).accounts[0].uuid;
const mkService = (accountUuid, name, meta) =>
  call('POST', '/services', {
    accountUuid,
    projectUuid: DEFAULT_PROJECT,
    name,
    type: 'vps',
    cost: '5.00',
    currency: 'USD',
    period: 'monthly',
    meta,
  });
const sVpn = await mkService(accVpn, 'madkid');
const sWork = await mkService(work.uuid, 'work-1');

step('projects and account defaults');
const pVpn = await call('POST', '/projects', { name: 'VPN' });
const pWork = await call('POST', '/projects', { name: 'Work' });
await call('PUT', `/account-projects/${accVpn}`, { projectUuid: pVpn.uuid });
await call('PUT', `/account-projects/${work.uuid}`, { projectUuid: pWork.uuid });
const list = await call('GET', '/account-projects');
assert.equal(list.find((a) => a.accountUuid === accVpn).projectUuid, pVpn.uuid);
await call(
  'PUT',
  `/account-projects/${accVpn}`,
  { projectUuid: '00000000-0000-4000-8000-000000000000' },
  404,
);

const dry = await call('POST', '/account-projects/apply?dryRun=true');
assert.equal(dry.moved, 2);
assert.equal((await getService(sVpn.uuid)).projectUuid, DEFAULT_PROJECT, 'dry run moves nothing');
const applied = await call('POST', '/account-projects/apply');
assert.equal(applied.moved, 2);
assert.equal((await getService(sVpn.uuid)).projectUuid, pVpn.uuid);
assert.equal((await getService(sWork.uuid)).projectUuid, pWork.uuid);

step('manual move back is never undone');
await call('PATCH', `/services/${sVpn.uuid}`, { projectUuid: DEFAULT_PROJECT });
assert.equal((await call('POST', '/account-projects/apply')).moved, 0);
assert.equal((await getService(sVpn.uuid)).projectUuid, DEFAULT_PROJECT);
await call('PATCH', `/services/${sVpn.uuid}`, { projectUuid: pVpn.uuid });

step('maps: create with new project, list, rename');
const map = await call('POST', '/topology/maps', {
  name: 'VPN',
  preset: 'vpn',
  projectUuid: pVpn.uuid,
});
const web = await call('POST', '/topology/maps', {
  name: 'Site',
  preset: 'web',
  createProject: { name: 'Site 1' },
});
assert.ok(web.projectUuid);
await call(
  'POST',
  '/topology/maps',
  { name: 'x', projectUuid: pVpn.uuid, createProject: { name: 'y' } },
  400,
);
await call('PATCH', `/topology/maps/${map.uuid}`, { name: 'VPN prod' });
assert.equal((await call('GET', '/topology/maps')).length, 2);

step('seed from services is idempotent');
assert.equal((await call('POST', `/topology/maps/${map.uuid}/seed-from-services`, {})).created, 1);
assert.equal((await call('POST', `/topology/maps/${map.uuid}/seed-from-services`, {})).created, 0);

step('nodes: external, group, ssh validation, parent cycle');
const clients = await call('POST', '/topology/nodes', {
  mapUuid: map.uuid,
  kind: 'external',
  role: 'client',
  label: 'Клиенты',
});
const inet = await call('POST', '/topology/nodes', {
  mapUuid: map.uuid,
  kind: 'external',
  role: 'internet',
  label: 'Интернет',
});
const group = await call('POST', '/topology/nodes', {
  mapUuid: map.uuid,
  kind: 'group',
  label: 'api-pl',
});
const inner = await call('POST', '/topology/nodes', {
  mapUuid: map.uuid,
  kind: 'external',
  label: 'IP A',
  parentUuid: group.uuid,
  addresses: [{ value: '203.0.113.1', direction: 'in', label: 'A' }],
});
await call('PATCH', `/topology/nodes/${group.uuid}`, { parentUuid: inner.uuid }, 400);
await call('PATCH', `/topology/nodes/${clients.uuid}`, { sshHost: 'bad host' }, 400);
await call('PATCH', `/topology/nodes/${clients.uuid}`, { sshUser: '1root' }, 400);
await call('PATCH', `/topology/nodes/${clients.uuid}`, { sshPort: 70000 }, 400);
const ssh = await call('PATCH', `/topology/nodes/${clients.uuid}`, {
  sshHost: '2001:db8::1',
  sshPort: 2222,
  sshUser: 'root',
  tabbyProfile: 'madkid',
});
assert.equal(ssh.sshPort, 2222);
await call('POST', '/topology/nodes', { mapUuid: map.uuid, kind: 'service' }, 400);

step('graph enriches service nodes');
const g = await call('GET', `/topology/maps/${map.uuid}`);
const svcNode = g.nodes.find((n) => n.serviceUuid === sVpn.uuid);
assert.equal(svcNode.service.name, 'madkid');
assert.equal(svcNode.service.providerName, 'Aeza');
assert.equal(g.settings.defaultSshUser, 'root');

step('links: create, self, duplicate (409), cross-map (400), patch, positions');
const link = await call('POST', '/topology/links', {
  mapUuid: map.uuid,
  fromUuid: clients.uuid,
  toUuid: svcNode.uuid,
  kind: 'entry',
  route: 2,
});
await call(
  'POST',
  '/topology/links',
  { mapUuid: map.uuid, fromUuid: clients.uuid, toUuid: clients.uuid },
  400,
);
await call(
  'POST',
  '/topology/links',
  { mapUuid: map.uuid, fromUuid: clients.uuid, toUuid: svcNode.uuid, kind: 'entry', route: 2 },
  409,
);
const other = await call('POST', '/topology/nodes', {
  mapUuid: web.uuid,
  kind: 'external',
  role: 'client',
});
await call(
  'POST',
  '/topology/links',
  { mapUuid: map.uuid, fromUuid: clients.uuid, toUuid: other.uuid },
  400,
);
const patched = await call('PATCH', `/topology/links/${link.uuid}`, {
  label: 'PL-OUT',
  animated: false,
});
assert.equal(patched.label, 'PL-OUT');
await call('PATCH', '/topology/positions', {
  positions: [
    { uuid: clients.uuid, x: 10, y: 20 },
    { uuid: svcNode.uuid, x: 300, y: 20 },
  ],
});
await call(
  'PATCH',
  '/topology/positions',
  { positions: [{ uuid: '00000000-0000-4000-8000-000000000000', x: 1, y: 1 }] },
  404,
);
const g2 = await call('GET', `/topology/maps/${map.uuid}`);
assert.equal(g2.nodes.find((n) => n.uuid === svcNode.uuid).posX, 300);

step('duplicate map, settings, delete');
const copy = await call('POST', `/topology/maps/${map.uuid}/duplicate`);
const gc = await call('GET', `/topology/maps/${copy.uuid}`);
assert.equal(gc.nodes.length, g2.nodes.length);
assert.equal(gc.links.length, 1);
assert.equal(gc.nodes.find((n) => n.label === 'IP A').parentUuid !== null, true);
const st = await call('PATCH', '/topology/settings', {
  layoutDirection: 'DOWN',
  animateEdges: false,
});
assert.equal(st.layoutDirection, 'DOWN');
await call('DELETE', `/topology/links/${link.uuid}`, undefined, 204);
await call('DELETE', `/topology/nodes/${clients.uuid}`, undefined, 204);
await call('DELETE', `/topology/maps/${copy.uuid}`, undefined, 204);
await call('DELETE', `/topology/maps/${map.uuid}`, undefined, 204);
assert.equal((await getService(sVpn.uuid)).name, 'madkid', 'service survives map delete');
await call('GET', `/topology/maps/${map.uuid}`, undefined, 404);

console.log('stage 1 smoke: OK');
