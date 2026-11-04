#!/usr/bin/env node
/**
 * Fork: checks the production stack (deploy/docker-compose.yml) from the outside, through Caddy.
 *
 *   PROD_URL=https://localhost:8443 node scripts/fork-e2e-prod.mjs
 *
 * Needs a fresh stack (first-run setup is done by the script) with a self-signed / internal
 * certificate (the script accepts it). Verifies: every page loads under the Content-Security-Policy
 * with no violation, the topology image export still works under it, repeated wrong passwords are
 * throttled, and (with BASIC_AUTH_PASSWORD) the optional second password gate.
 */
import assert from 'node:assert/strict';
import https from 'node:https';
import { chromium } from 'playwright';

const BASE = (process.env.PROD_URL ?? 'https://localhost:8443').replace(/\/$/, '');
const PASSWORD = 'prod-check-correct-horse-battery';
const GATE = process.env.BASIC_AUTH_PASSWORD; // set when caddy/extra/basic-auth.caddy is active
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const gateHeader = GATE
  ? { authorization: `Basic ${Buffer.from(`owner:${GATE}`).toString('base64')}` }
  : {};
// node:https instead of fetch: a name that resolves to ::1 first would hit a port Docker only
// publishes on IPv4, so the lookup is pinned to 127.0.0.1 while the TLS name stays "localhost".
const agent = new https.Agent({
  rejectUnauthorized: false,
  lookup: (_host, _opts, cb) => cb(null, [{ address: '127.0.0.1', family: 4 }]),
});
function req(method, path, { body, headers = {}, cookie } = {}) {
  const url = new URL(`${BASE}${path}`);
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const r = https.request(
      url,
      {
        method,
        agent,
        headers: {
          'content-type': 'application/json',
          ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}),
          ...(cookie ? { cookie } : {}),
          ...headers,
        },
      },
      (res) => {
        let text = '';
        res.on('data', (c) => {
          text += c;
        });
        res.on('end', () => {
          const h = new Map(Object.entries(res.headers));
          resolve({
            status: res.statusCode,
            text,
            headers: {
              get: (k) => {
                const v = h.get(k.toLowerCase());
                return Array.isArray(v) ? v.join(', ') : (v ?? null);
              },
              getSetCookie: () => res.headers['set-cookie'] ?? [],
            },
          });
        });
      },
    );
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}
const step = (n) => console.log(`- ${n}`);

if (GATE) {
  step('the second password gates everything, the setup page included');
  assert.equal((await req('GET', '/')).status, 401);
  assert.match((await req('GET', '/')).headers.get('www-authenticate') ?? '', /Basic/);
  assert.equal(
    (await req('POST', '/api/auth/setup', { body: { username: 'x', password: 'y' } })).status,
    401,
  );
  assert.equal(
    (await req('GET', '/', { headers: { authorization: 'Basic eDp4' } })).status,
    401,
    'wrong password',
  );
  assert.equal((await req('GET', '/', { headers: gateHeader })).status, 200);
  // A fake Bearer reaches the panel on /api/* (and is refused there), but never on /api/auth/*.
  const bearer = await req('GET', '/api/services', { headers: { authorization: 'Bearer nope' } });
  assert.equal(bearer.status, 401);
  assert.doesNotMatch(
    bearer.headers.get('www-authenticate') ?? '',
    /Basic/,
    'answered by the panel, not by the gate',
  );
  assert.equal(
    (
      await req('POST', '/api/auth/setup', {
        headers: { authorization: 'Bearer nope' },
        body: { username: 'x', password: 'y' },
      })
    ).status,
    401,
  );
  assert.match(
    (
      await req('POST', '/api/auth/setup', { headers: { authorization: 'Bearer nope' }, body: {} })
    ).headers.get('www-authenticate') ?? '',
    /Basic/,
    'Bearer does not skip the gate on /api/auth/*',
  );
}

step('first-run setup through the proxy');
const setup = await req('POST', '/api/auth/setup', {
  headers: gateHeader,
  body: { username: 'owner', password: PASSWORD },
});
assert.equal(setup.status, 200, setup.text);
const login = await req('POST', '/api/auth/login', {
  headers: gateHeader,
  body: { username: 'owner', password: PASSWORD },
});
assert.equal(login.status, 200, login.text);
const cookie = login.headers
  .getSetCookie()
  .map((c) => c.split(';')[0])
  .join('; ');
const cookieAttrs = login.headers.getSetCookie().join(' ');
assert.match(cookieAttrs, /Secure/i);
assert.match(cookieAttrs, /HttpOnly/i);
assert.match(cookieAttrs, /SameSite=Strict/i);

step('a map with nodes for the topology page');
const call = async (m, p, b) =>
  JSON.parse((await req(m, `/api${p}`, { headers: gateHeader, cookie, body: b })).text || 'null');
const map = await call('POST', '/topology/maps', { name: 'Prod check', preset: 'vpn' });
const a = await call('POST', '/topology/nodes', {
  mapUuid: map.uuid,
  kind: 'external',
  role: 'client',
  label: 'Clients',
});
const b = await call('POST', '/topology/nodes', {
  mapUuid: map.uuid,
  kind: 'external',
  role: 'exit',
  label: 'Exit',
  addresses: [{ value: '203.0.113.5', direction: 'in' }],
});
await call('POST', '/topology/links', {
  mapUuid: map.uuid,
  fromUuid: a.uuid,
  toUuid: b.uuid,
  kind: 'chain',
  route: 1,
});

step('every page loads under the CSP without a violation or a console error');
const browser = await chromium.launch(
  process.env.CAPTURE_BROWSER_PATH
    ? { executablePath: process.env.CAPTURE_BROWSER_PATH }
    : { channel: 'chrome' },
);
const ctx = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1500, height: 900 },
  ...(GATE ? { httpCredentials: { username: 'owner', password: GATE } } : {}),
});
const page = await ctx.newPage();
const problems = [];
// api.github.com is blocked on purpose (star counter / update check): expected, not a problem.
const expected = (t) => /api\.github\.com|401/.test(t);
await page.addInitScript(() => {
  window.__csp = [];
  document.addEventListener('securitypolicyviolation', (e) =>
    window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`),
  );
});
page.on(
  'console',
  (m) => m.type() === 'error' && !expected(m.text()) && problems.push(`console: ${m.text()}`),
);
page.on('pageerror', (e) => problems.push(`pageerror: ${e}`));

await page.goto(`${BASE}/login`);
await page.locator('input').first().fill('owner');
await page.locator('input[type=password]').first().fill(PASSWORD);
await page.keyboard.press('Enter');
await page.waitForURL(`${BASE}/`);
for (const path of [
  '/',
  '/providers',
  '/projects',
  '/services',
  '/payments',
  `/topology?map=${map.uuid}`,
  '/settings',
  '/settings/auth',
  '/settings/tokens',
  '/settings/profiles',
  '/settings/topology',
]) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  const violations = (await page.evaluate(() => window.__csp)).filter((v) => !expected(v));
  if (violations.length) problems.push(`CSP on ${path}: ${violations.join('; ')}`);
}

step('the topology image export works under the CSP');
await page.goto(`${BASE}/topology?map=${map.uuid}`);
await page.waitForSelector('.react-flow__node');
await page.waitForTimeout(1500);
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 20000 }),
  (async () => {
    await page.getByRole('button', { name: /Экспорт|Export/ }).click();
    await page.getByRole('menuitem', { name: 'PNG' }).click();
  })(),
]);
assert.match(download.suggestedFilename(), /\.png$/);
const violations = (await page.evaluate(() => window.__csp)).filter((v) => !expected(v));
if (violations.length) problems.push(`CSP during export: ${violations.join('; ')}`);
await browser.close();
assert.deepEqual(problems, [], problems.join('\n'));

step('repeated wrong passwords are throttled through the proxy too');
let blocked = false;
for (let i = 0; i < 12 && !blocked; i += 1) {
  const r = await req('POST', '/api/auth/login', {
    headers: gateHeader,
    body: { username: 'owner', password: `wrong-${i}` },
  });
  if (r.status === 429) {
    blocked = true;
    assert.ok(Number(r.headers.get('retry-after')) > 0);
  } else assert.equal(r.status, 401);
}
assert.ok(blocked, 'blocked after repeated failures');

console.log('prod e2e: OK');
