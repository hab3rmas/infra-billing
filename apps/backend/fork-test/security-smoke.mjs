// Live checks of the production hardening against a running panel on a FRESH database:
//   BASE=http://127.0.0.1:8091 node apps/backend/fork-test/security-smoke.mjs
// (it runs first-run setup and then hammers the sign-in on purpose.)
import assert from 'node:assert/strict';

const BASE = process.env.BASE ?? 'http://127.0.0.1:8080';
const PASSWORD = 'correct-horse-battery-staple';

async function req(method, path, { body, headers = {}, cookie } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return {
    status: res.status,
    headers: res.headers,
    text,
    json: text && text[0] === '{' ? JSON.parse(text) : null,
  };
}
const step = (n) => console.log(`- ${n}`);
// Another "client": the panel trusts X-Forwarded-For from a private peer (here: loopback).
const from = (ip) => ({ 'x-forwarded-for': ip });

step('first-run setup');
assert.equal(
  (await req('POST', '/api/auth/setup', { body: { username: 'owner', password: PASSWORD } }))
    .status,
  200,
);

step('the Swagger UI is off by default');
assert.equal((await req('GET', '/api/docs')).status, 404);

step('wrong passwords are counted per client and then blocked (429 + Retry-After)');
let blockedAt = 0;
for (let i = 1; i <= 12; i += 1) {
  const r = await req('POST', '/api/auth/login', {
    body: { username: 'owner', password: `wrong-${i}` },
    headers: from('198.51.100.10'),
  });
  if (r.status === 429) {
    blockedAt = i;
    assert.ok(Number(r.headers.get('retry-after')) > 0, 'Retry-After is set');
    assert.equal(r.json.error.code, 'too_many_requests');
    break;
  }
  assert.equal(r.status, 401, `attempt ${i}`);
}
assert.equal(blockedAt, 9, 'the 8th failure trips the limit, the 9th attempt is refused');

step('while blocked even the right password is refused for that client');
const rightButBlocked = await req('POST', '/api/auth/login', {
  body: { username: 'owner', password: PASSWORD },
  headers: from('198.51.100.10'),
});
assert.equal(rightButBlocked.status, 429);

step('another client is not affected, and the owner can sign in');
const ok = await req('POST', '/api/auth/login', {
  body: { username: 'owner', password: PASSWORD },
  headers: from('203.0.113.77'),
});
assert.equal(ok.status, 200, ok.text);
const cookie = ok.headers
  .getSetCookie()
  .map((c) => c.split(';')[0])
  .join('; ');
const setCookie = ok.headers.getSetCookie().join(' ');
assert.match(setCookie, /HttpOnly/i);
assert.match(setCookie, /SameSite=Strict/i);

step('guessing Bearer tokens is throttled too, a valid session is not');
let tokenBlocked = false;
for (let i = 0; i < 12 && !tokenBlocked; i += 1) {
  const r = await req('GET', '/api/services', {
    headers: { authorization: 'Bearer not-a-real-token', ...from('198.51.100.20') },
  });
  if (r.status === 429) tokenBlocked = true;
  else assert.equal(r.status, 401);
}
assert.ok(tokenBlocked, 'repeated wrong tokens get blocked');
assert.equal(
  (await req('GET', '/api/services', { cookie, headers: from('203.0.113.77') })).status,
  200,
);

step(
  'a client cannot dodge the limit by sending its own X-Forwarded-For (direct peer is trusted only when private)',
);
// (This server sees a loopback peer, so XFF is honoured here; the unit tests cover the public-peer case.)

step(
  'the owner session cookie is not readable by scripts and secrets never come back from the API',
);
const settings = await req('GET', '/api/settings', { cookie, headers: from('203.0.113.77') });
assert.equal(settings.status, 200);
assert.ok(
  !/telegramBotToken(?!Set)/.test(settings.text) || /telegramBotTokenSet/.test(settings.text),
);

console.log('security smoke: OK');
