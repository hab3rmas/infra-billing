// Profile leak test against a running panel (DOCS=true, fresh or existing database):
//   BASE=http://127.0.0.1:8091 node apps/backend/fork-test/profile-leak.mjs
// Builds two profiles (VPN, Site) with separate and shared accounts, then calls EVERY GET endpoint
// from the Swagger document that has no path params with X-Profile of profile A and checks that no
// uuid that exists only in profile B shows up. Re-run it after every merge from upstream: new
// endpoints of the author are covered automatically.
import assert from 'node:assert/strict';

const BASE = process.env.BASE ?? 'http://127.0.0.1:8080';
const RUN = Date.now().toString(36);
let cookie = '';

async function raw(method, path, { body, profile } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      cookie,
      ...(profile ? { 'X-Profile': profile } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // not JSON (the Tabby YAML export): the leak check works on the text
  }
  return { status: res.status, text, json };
}

async function call(method, path, opts = {}, expected) {
  const r = await raw(method, `/api${path}`, opts);
  if (expected !== undefined)
    assert.equal(r.status, expected, `${method} ${path} -> ${r.status} ${r.text}`);
  else assert.ok(r.status < 400, `${method} ${path} -> ${r.status} ${r.text}`);
  return r.json;
}

const step = (n) => console.log(`- ${n}`);

step('login');
await raw('POST', '/api/auth/setup', { body: { username: 'owner', password: 'password123' } });
await call('POST', '/auth/login', { body: { username: 'owner', password: 'password123' } });

step('first use of the settings row is race-free (concurrent requests)');
const parallel = await Promise.all(
  Array.from({ length: 8 }, () => raw('GET', '/api/topology/settings')),
);
assert.ok(
  parallel.every((r) => r.status === 200),
  parallel.map((r) => r.status).join(','),
);

step('fixture: 2 profiles, separate and shared accounts, services, payments, maps');
const proj = (name) => call('POST', '/projects', { body: { name: `${name}-${RUN}` } });
const pa = await proj('VPN');
const pb = await proj('Site');
const A = await call('POST', '/profiles', {
  body: { name: `VPN ${RUN}`, projectUuids: [pa.uuid], defaultProjectUuid: pa.uuid },
});
const B = await call('POST', '/profiles', {
  body: { name: `Site ${RUN}`, projectUuids: [pb.uuid], defaultProjectUuid: pb.uuid },
});

async function provider(name, label) {
  const p = await call('POST', '/providers', {
    body: { name: `${name}-${RUN}`, kind: 'manual', account: { label } },
  });
  const full = await call('GET', `/providers/${p.uuid}`);
  return { provider: p, account: full.accounts[0] };
}
const provA = await provider('OnlyA', 'a');
const provB = await provider('OnlyB', 'b');
const shared = await provider('Shared', 'one');
const sharedAcc2 = await call('POST', `/providers/${shared.provider.uuid}/accounts`, {
  body: { label: 'two' },
});

const svc = (accountUuid, projectUuid, name) =>
  call('POST', '/services', {
    body: {
      accountUuid,
      projectUuid,
      name: `${name}-${RUN}`,
      type: 'vps',
      cost: '5.00',
      currency: 'USD',
      period: 'monthly',
      nextBillingAt: new Date(Date.now() + 86400000).toISOString(),
    },
  });
const sA = await svc(provA.account.uuid, pa.uuid, 'svc-a');
const sB = await svc(provB.account.uuid, pb.uuid, 'svc-b');
const sSharedA = await svc(shared.account.uuid, pa.uuid, 'shared-a');
const sSharedB = await svc(shared.account.uuid, pb.uuid, 'shared-b');
// An account used only by profile B, sitting in the same provider as a profile A account.
const sB2 = await svc(sharedAcc2.uuid, pb.uuid, 'svc-b2');

const pay = (accountUuid, serviceUuid, desc) =>
  call('POST', '/payments', {
    body: {
      accountUuid,
      serviceUuid,
      amount: '5.00',
      currency: 'USD',
      paymentDate: new Date().toISOString(),
      description: `${desc}-${RUN}`,
    },
  });
const payA = await pay(provA.account.uuid, sA.uuid, 'pay-a');
const payB = await pay(provB.account.uuid, sB.uuid, 'pay-b');
const payTopupB = await call('POST', '/payments', {
  body: {
    accountUuid: provB.account.uuid,
    amount: '9.00',
    currency: 'USD',
    paymentDate: new Date().toISOString(),
    type: 'topup',
  },
});

const mapA = await call('POST', '/topology/maps', {
  body: { name: `map-a-${RUN}`, preset: 'vpn' },
  profile: A.uuid,
});
const mapB = await call('POST', '/topology/maps', {
  body: { name: `map-b-${RUN}`, preset: 'web' },
  profile: B.uuid,
});
assert.equal(mapA.profileUuid, A.uuid, 'a map created inside a profile belongs to it');

// A map created WITH a new project, inside a profile: the project joins the profile in the same
// transaction (regression: the membership row used to be written outside it and broke the FK).
const mapNew = await call('POST', '/topology/maps', {
  body: { name: `map-new-${RUN}`, preset: 'web', createProject: { name: `Proj-${RUN}` } },
  profile: A.uuid,
});
assert.equal(mapNew.profileUuid, A.uuid);
const projsA = await call('GET', '/projects', { profile: A.uuid });
assert.ok(
  projsA.some((p) => p.uuid === mapNew.projectUuid),
  'the new project is visible in the profile it was made in',
);
const projsB = await call('GET', '/projects', { profile: B.uuid });
assert.ok(!projsB.some((p) => p.uuid === mapNew.projectUuid), 'and not in the other profile');

// Account created inside profile B must be visible there straight away.
const newProv = await call('POST', '/providers', {
  body: { name: `NewInB-${RUN}`, kind: 'manual', account: { label: 'n' } },
  profile: B.uuid,
});
const inB = await call('GET', '/providers', { profile: B.uuid });
assert.ok(
  inB.some((p) => p.uuid === newProv.uuid),
  'provider created in a profile is visible in it',
);

// Everything that exists only in profile B (shared account/provider are expected in A).
const forbidden = [
  pb.uuid,
  B.uuid,
  sB.uuid,
  sB2.uuid,
  sSharedB.uuid,
  payB.uuid,
  payTopupB.uuid,
  mapB.uuid,
  provB.provider.uuid,
  provB.account.uuid,
  sharedAcc2.uuid,
  newProv.uuid,
];

step('every GET without path params, as profile A');
const doc = (await raw('GET', '/api/docs-json')).json;
assert.ok(doc?.paths, 'Swagger is off: start the panel with DOCS=true');
// /profiles is the workspace list itself: the switcher needs all of them.
const SKIP = /^\/api\/(health|build-info|auth\/|docs|profiles)/;
let checked = 0;
for (const [path, item] of Object.entries(doc.paths)) {
  if (!item.get || path.includes('{') || SKIP.test(path)) continue;
  const r = await raw('GET', path, { profile: A.uuid });
  if (r.status >= 500) assert.fail(`GET ${path} -> ${r.status} ${r.text.slice(0, 200)}`);
  for (const id of forbidden) {
    assert.ok(!r.text.includes(id), `LEAK: GET ${path} as profile A contains ${id}`);
  }
  checked += 1;
}
console.log(`  ${checked} endpoints checked`);

step('profile A sees its own and the shared account');
const provsA = await call('GET', '/providers', { profile: A.uuid });
const ids = provsA.map((p) => p.uuid);
assert.ok(ids.includes(provA.provider.uuid) && ids.includes(shared.provider.uuid));
assert.ok(!ids.includes(provB.provider.uuid));
const sharedInA = provsA.find((p) => p.uuid === shared.provider.uuid);
assert.deepEqual(
  sharedInA.accounts.map((a) => a.uuid),
  [shared.account.uuid],
  'only the account of A inside the shared provider',
);
const svcsA = await call('GET', '/services', { profile: A.uuid });
assert.deepEqual(svcsA.map((s) => s.uuid).sort(), [sA.uuid, sSharedA.uuid].sort());

step('a foreign uuid is a 404 for read, update and delete');
await call('PATCH', `/services/${sB.uuid}`, { body: { name: 'x' }, profile: A.uuid }, 404);
await call('DELETE', `/services/${sB.uuid}`, { profile: A.uuid }, 404);
await call('PATCH', `/projects/${pb.uuid}`, { body: { name: 'x' }, profile: A.uuid }, 404);
await call('DELETE', `/providers/${provB.provider.uuid}`, { profile: A.uuid }, 404);
await call('GET', `/topology/maps/${mapB.uuid}`, { profile: A.uuid }, 404);
await call(
  'POST',
  '/services',
  {
    body: {
      accountUuid: provA.account.uuid,
      projectUuid: pb.uuid,
      name: 'x',
      type: 'vps',
      cost: '1.00',
      currency: 'USD',
      period: 'monthly',
    },
    profile: A.uuid,
  },
  404,
);
await call('GET', '/services', { profile: '00000000-0000-4000-8000-000000000000' }, 404);
await call('GET', '/services', { profile: 'not-a-uuid' }, 400);

step('"All" (no header) is upstream: everything is visible');
const all = await call('GET', '/services');
for (const s of [sA, sB, sSharedA, sSharedB, sB2]) assert.ok(all.some((x) => x.uuid === s.uuid));
const allMaps = await call('GET', '/topology/maps');
assert.ok(allMaps.some((m) => m.uuid === mapA.uuid) && allMaps.some((m) => m.uuid === mapB.uuid));

step('test message is labelled and does not crash without Telegram');
const t = await call('POST', `/profiles/${A.uuid}/test-notification`);
assert.equal(t.sent, false, 'Telegram is not configured here');

console.log('profile leak test: OK');
