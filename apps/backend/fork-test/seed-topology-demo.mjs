// Builds the owner's scheme (section 0 of the task) and a small website scheme through the API, to
// look at the topology page:
//   BASE=http://127.0.0.1:8091 USER_NAME=owner PASSWORD=… node apps/backend/fork-test/seed-topology-demo.mjs
// Demo data only: run it against a throwaway panel.
import assert from 'node:assert/strict';

const BASE = process.env.BASE ?? 'http://127.0.0.1:8080';
const RUN = Date.now().toString(36);
let cookie = '';

async function call(method, path, body) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
  const text = await res.text();
  assert.ok(res.status < 400, `${method} ${path} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

await call('POST', '/auth/login', {
  username: process.env.USER_NAME ?? 'owner',
  password: process.env.PASSWORD ?? 'password123',
});

// ---- VPN map --------------------------------------------------------------------------------
const project = await call('POST', '/projects', { name: `VPN demo ${RUN}` });
const provider = await call('POST', '/providers', {
  name: `Aeza demo ${RUN}`,
  kind: 'manual',
  account: { label: 'VPN' },
});
const account = (await call('GET', `/providers/${provider.uuid}`)).accounts[0];
const service = (name, countryCode, cost) =>
  call('POST', '/services', {
    accountUuid: account.uuid,
    projectUuid: project.uuid,
    name,
    type: 'vps',
    cost,
    currency: 'EUR',
    period: 'monthly',
    countryCode,
  });
const sMadkid = await service('madkid', 'RU', '4.50');
const sPl = await service('api-pl', 'PL', '6.00');
const sSteal = await service('steal-sg', 'SG', '5.00');
const sPanel = await service('panel', 'DE', '3.00');

const map = await call('POST', '/topology/maps', {
  name: 'VPN prod',
  preset: 'vpn',
  projectUuid: project.uuid,
});
const node = (body) => call('POST', '/topology/nodes', { mapUuid: map.uuid, ...body });
const link = (from, to, body = {}) =>
  call('POST', '/topology/links', {
    mapUuid: map.uuid,
    fromUuid: from.uuid,
    toUuid: to.uuid,
    ...body,
  });

const clients = await node({ kind: 'external', role: 'client', label: 'Клиенты' });
const madkid = await node({
  kind: 'service',
  serviceUuid: sMadkid.uuid,
  role: 'bridge',
  label: 'madkid',
  addresses: [{ value: 'madkid.zxcnub.xyz', direction: 'in' }],
});
const ruSites = await node({ kind: 'external', role: 'internet', label: 'RU сайты' });
const group = await node({ kind: 'group', serviceUuid: sPl.uuid, label: 'api-pl · Польша' });
const ipA = await node({
  kind: 'external',
  role: 'entry',
  label: 'IP A · вход',
  parentUuid: group.uuid,
  addresses: [{ value: '203.0.113.10', direction: 'in' }],
});
const ipB = await node({
  kind: 'external',
  role: 'exit',
  label: 'IP B · выход',
  parentUuid: group.uuid,
  addresses: [{ value: '203.0.113.11', direction: 'out' }],
});
const internet = await node({ kind: 'external', role: 'internet', label: 'Интернет' });
const steal = await node({
  kind: 'service',
  serviceUuid: sSteal.uuid,
  role: 'exit',
  label: 'steal-sg',
});
const warp = await node({ kind: 'external', role: 'internet', label: 'Cloudflare WARP' });
const panel = await node({
  kind: 'service',
  serviceUuid: sPanel.uuid,
  role: 'panel',
  label: 'Remnawave panel',
});
const subPage = await node({ kind: 'external', role: 'subscription', label: 'Страница подписок' });
const bot = await node({ kind: 'external', role: 'bot', label: 'Telegram-бот' });
const monitoring = await node({ kind: 'external', role: 'monitoring', label: 'Мониторинг' });

await link(clients, madkid, { kind: 'entry', label: 'RU-BRIDGE' });
await link(madkid, ruSites, { kind: 'direct', route: 1 });
await link(madkid, ipA, { kind: 'bridge', route: 2, label: 'PL-OUT', protocol: 'vless-reality' });
await link(ipA, ipB, { kind: 'chain', label: 'внутри сервера' });
await link(ipB, internet, { kind: 'exit', label: 'DIRECT' });
await link(clients, steal, { kind: 'entry' });
await link(steal, warp, { kind: 'warp', label: 'warp-out' });
await link(warp, internet, { kind: 'exit' });
await link(panel, madkid, { kind: 'panel', label: '2222' });
await link(panel, steal, { kind: 'panel', label: '2222' });
await link(subPage, panel, { kind: 'subscription' });
await link(clients, subPage, { kind: 'subscription', label: 'подписка' });
await link(bot, panel, { kind: 'api' });
await link(monitoring, panel, { kind: 'depends' });

// ---- website map ----------------------------------------------------------------------------
const web = await call('POST', '/topology/maps', {
  name: 'Site',
  preset: 'web',
  createProject: { name: `Site demo ${RUN}` },
});
const wn = (role, label, kind = 'external') =>
  call('POST', '/topology/nodes', { mapUuid: web.uuid, kind, role, label });
const wl = (from, to, kind, extra = {}) =>
  call('POST', '/topology/links', {
    mapUuid: web.uuid,
    fromUuid: from.uuid,
    toUuid: to.uuid,
    kind,
    ...extra,
  });

const users = await wn('client', 'Пользователи');
const cf = await wn('cdn', 'Cloudflare (CDN)');
const lb = await wn('loadbalancer', 'LB');
const web1 = await wn('web', 'web-1');
const web2 = await wn('web', 'web-2');
const app1 = await wn('app', 'app-1');
const app2 = await wn('app', 'app-2');
const pg = await wn('database', 'PostgreSQL primary');
const replica = await wn('db-replica', 'PostgreSQL replica');
const redis = await wn('cache', 'Redis');
const s3 = await wn('storage', 'S3');
const backups = await wn('backup', 'Бэкапы');
const mon = await wn('monitoring', 'Мониторинг');
const bastion = await wn('bastion', 'Бастион');

await wl(users, cf, 'http');
await wl(cf, lb, 'http');
for (const w of [web1, web2]) await wl(lb, w, 'http');
await wl(web1, app1, 'http');
await wl(web2, app2, 'http');
for (const a of [app1, app2]) {
  await wl(a, pg, 'db');
  await wl(a, redis, 'cache');
}
await wl(app1, s3, 'storage');
await wl(pg, replica, 'replication');
await wl(pg, backups, 'backup');
await wl(mon, pg, 'depends');
await wl(bastion, app1, 'ssh');

console.log(JSON.stringify({ vpn: map.uuid, web: web.uuid }));
